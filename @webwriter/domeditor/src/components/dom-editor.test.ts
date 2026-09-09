// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import {excludedMarkNames} from "../marks"
import {AppRibbon} from "./ribbon"
import type {DomEditorToolbox} from "./toolbox"
import {DomEditorBreadcrumb, type DocumentTreeItem} from "./breadcrumb"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenu} from "./ribbon-menu"
import {
  executeCompleteEvent,
  executeFailureEvent,
  aiEditReviewEvent,
  initializeEditorMessage,
  loadWidgetsMessage,
  markStateChangeEvent,
  presenceChangeEvent,
  documentHeadStateChangeEvent,
  selectionChangeEvent,
  type VersionHistoryState,
} from "../editor-bridge"
import {WEBWRITER_GENERATOR, emptyDocumentHeadState} from "../document-head"
import {INSTALLED_PACKAGES_STORAGE_KEY, WebWriterPackageRegistry, type WebWriterPackage} from "../packages"
import {LocalPackageWorkerClient} from "../local-package-worker-client"
import {LiveSession} from "../live-session"
import type {LiveSessionOverlay} from "./live-session-overlay"
import type {LiveSessionControls} from "./live-session-controls"
import {APP_SETTINGS_STORAGE_KEY, defaultAppSettings} from "../app-settings"

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

const localPackageDirectory = (withBundle: boolean | {current: boolean} = true) => {
  const bundleAvailable = () => typeof withBundle === "boolean" ? withBundle : withBundle.current
  const manifest = JSON.stringify({
    name: "@local/demo",
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

const editableLocalPackageDirectory = () => {
  const directory = localPackageDirectory() as FileSystemDirectoryHandle
  let manifest = {
    name: "@local/demo",
    version: "0.1.0",
    description: "Editable local package",
    keywords: ["webwriter-widget"],
    exports: {
      "./widgets/local-demo.*": {source: "./src/local-demo.ts", default: "./dist/local-demo.*"},
    },
  } as Record<string, unknown>
  const originalGetFileHandle = directory.getFileHandle.bind(directory)
  directory.getFileHandle = async(name: string) => {
    if(name !== "package.json") return await originalGetFileHandle(name)
    return {
      name,
      kind: "file",
      getFile: async() => new File([JSON.stringify(manifest)], name, {type: "application/json", lastModified: 1}),
      createWritable: async() => ({
        write: async(value: FileSystemWriteChunkType) => {
          const text = typeof value === "string" ? value : value instanceof Blob ? await value.text() : ""
          manifest = JSON.parse(text) as Record<string, unknown>
        },
        close: async() => undefined,
      }),
    } as unknown as FileSystemFileHandle
  }
  return {directory, manifest: () => manifest}
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

async function mountEditor() {
  const editor = new DomEditor()
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  wirePackageLoadCompletion(iframe.contentWindow!)
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

afterEach(async() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // Release Happy DOM's nested iframe documents before detaching editors. A
  // preview test can leave both the editor and preview browsing contexts alive
  // until the next GC cycle, which makes the later tests time out as a suite.
  const frames = [
    ...document.body.querySelectorAll<HTMLIFrameElement>("iframe"),
    ...Array.from(document.body.querySelectorAll<DomEditor>("dom-editor"))
      .flatMap(editor => Array.from(editor.shadowRoot?.querySelectorAll<HTMLIFrameElement>("iframe") ?? [])),
  ]
  frames.forEach(iframe => iframe.remove())
  document.body.replaceChildren()
  localStorage.removeItem(INSTALLED_PACKAGES_STORAGE_KEY)
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
  await (window as unknown as {happyDOM: {abort(): Promise<void>}}).happyDOM.abort()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
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

describe("DomEditor iframe setup", () => {
  it("shows and dismisses file errors outside the authored document", async () => {
    const {editor, iframe} = await mountEditor()
    vi.spyOn(console, "error").mockImplementation(() => {})
    const listener = vi.fn()
    editor.addEventListener("file-error", listener)
    ;(editor as any).reportFileError(new Error("The disk is full"))
    await editor.updateComplete
    const alert = editor.shadowRoot!.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain("The disk is full")
    expect(listener).toHaveBeenCalledOnce()
    expect(iframe.contentDocument!.querySelector('[role="alert"]')).toBeNull()
    alert.querySelector("button")!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector('[role="alert"]')).toBeNull()
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
    expect(preview.querySelector("iframe")!.getAttribute("sandbox")).toBe("allow-scripts")
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
    expect([...preview.querySelectorAll("script")].every(script => script.src && !script.textContent)).toBe(true)
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


  it.each(["local", "development-server"])("keeps edits dirty during %s saves and excludes overlapping file actions", async storageLocation => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.storageLocation = storageLocation
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const write = vi.fn(() => pending)
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({
      name: "lesson.html", createWritable: async() => ({write, close: async() => {}}),
    }))
    host.backendClient = {createDocument: vi.fn(async() => { await write(); return {id: "saved", title: "lesson", format: "html"} })}
    vi.spyOn(editor, "execute").mockResolvedValue("<p>Saved snapshot</p>")
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const saving = host.saveDocument()
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("p"))
    await new Promise(resolve => setTimeout(resolve, 0))
    await host.newDocument()
    await host.saveDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledOnce()
    finish()
    await saving
    expect(host.fileDirty).toBe(true)
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


  it("resolves widget paths without relying on the outer realm's Element constructor", async () => {
    const {editor, iframe} = await mountEditor()
    const owner = iframe.contentDocument!
    owner.body.innerHTML = "<review-widget></review-widget>text"
    const widget = owner.body.firstElementChild
    const resolve = (editor as unknown as {previewElementAtPath(path: number[], owner: Document): Element | null}).previewElementAtPath.bind(editor)
    vi.stubGlobal("Element", class ForeignElement {})
    try {
      expect(resolve([0], owner)).toBe(widget)
      expect(resolve([1], owner)).toBeNull()
      expect(resolve([2], owner)).toBeNull()
    }
    finally { vi.unstubAllGlobals() }
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
    expect(iframe.contentDocument!.documentElement.lang).toBe("en")
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

  it("applies the language setting to the active document when requested", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const settings = {...defaultAppSettings(), language: "de"}
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: settings,
      bubbles: true,
      composed: true,
    }))

    expect(editor.lang).toBe("de")
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

  it("automatically logs in when the no-auth development backend answers the probe", async () => {
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
    await (editor as any).loginToBackend()

    await vi.waitFor(() => expect((editor as any).backendState).toBe("connected"))
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete

    expect((editor as any).storageLocation).toBe("development-server")
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".login-button")?.textContent).toContain("Local dev")
    expect(getComputedStyle(ribbon.shadowRoot!.querySelector(".login-button")!).display).toBe("none")
  })

  it("collapses the expanded AI bar when the editor receives a pointer", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-prompt-expand")!

    expand.click()
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")?.hasAttribute("data-open")).toBe(true)

    iframe.contentDocument!.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true}))
    await ribbon.updateComplete

    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")?.hasAttribute("data-open")).toBe(false)
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
    const search = vi.mocked(WebWriterPackageRegistry.prototype.search)
    const editor = new DomEditor()
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector("iframe")!
    const postMessage = wirePackageLoadCompletion(iframe.contentWindow!)
    iframe.dispatchEvent(new Event("load"))

    expect(search).toHaveBeenCalledTimes(1)
    expect((editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages).toEqual([demoPackage])

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
      requestId: expect.any(String),
    }), window.location.origin)
  })

  it("sandboxes the editor iframe while preserving its trusted same-origin bridge", async () => {
    const {editor, iframe} = await mountEditor()
    const srcdoc = (editor as unknown as {readonly editorSrcdoc: string}).editorSrcdoc

    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin")
    expect(srcdoc).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/)
    expect(srcdoc).toMatch(/style-src 'none'/)
    expect(srcdoc).toMatch(/style-src-elem 'nonce-[^']+'/)
    expect(srcdoc).toContain("style-src-attr 'unsafe-inline'")
    expect(srcdoc).toContain("connect-src * data: blob:")
    expect(srcdoc).toContain("frame-src https:")
    expect(srcdoc).toContain("worker-src blob: https:")
    expect(srcdoc).not.toContain("'unsafe-eval'")
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
    expect(editor.editorSrcdoc).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic' 'unsafe-eval';/)
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

  it("loads the scoped custom element registry polyfill before widgets", async () => {
    const editor = new DomEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector("iframe")!
    const postMessage = wirePackageLoadCompletion(iframe.contentWindow!)
    const srcdoc = (editor as unknown as {readonly editorSrcdoc: string}).editorSrcdoc

    iframe.dispatchEvent(new Event("load"))

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.0.0"}],
      packages: [demoPackage],
      requestId: expect.any(String),
    }), window.location.origin)
    const polyfillUrl = "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js"
    expect(srcdoc).toMatch(new RegExp(`<script class="◆ ◆editor-only" nonce="[^"]+" type="application/json" src="${polyfillUrl.replaceAll(".", "\\.")}"></script>`))
    expect(srcdoc.indexOf(polyfillUrl)).toBeLessThan(srcdoc.indexOf("editor-entry"))
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

describe("Develop local packages", () => {
  it("picks, serves, watches, and enables a built local package", async () => {
    const directory = localPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(directory))
    const start = vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const register = vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const reload = vi.spyOn(editor as any, "reloadEditor").mockImplementation(async (...args: unknown[]) => {
      ;(editor as any).installedPackages = args[0] as WebWriterPackage[]
    })

    await (editor as any).addLocalPackage()

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
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".develop-mode-toggle")!.click()
    await toolbox.updateComplete
    expect(toolbox.localPackages).toEqual(packages)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Local packages"]')).not.toBeNull()
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

  it("writes all WebWriter metadata shapes back to package.json", async() => {
    const editable = editableLocalPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(editable.directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()

    const updates = [
      ["license", "MIT"],
      ["keywords", "webwriter-widget\nwidget-lang-en\nwidget-practical"],
      ["author", '{"name":"Ada Lovelace","email":"ada@example.test"}'],
      ["contributors", '["Grace Hopper <grace@example.test>"]'],
      ["customElements", "custom-elements.json"],
      ["editingConfig", '{".":{"label":{"_":"Demo package"}}}'],
    ]
    for(const [field, value] of updates) {
      await (editor as any).handleLocalPackageMetadataChange(new CustomEvent("local-package-metadata-change", {
        detail: {field, value},
      }))
    }

    expect(editable.manifest().license).toBe("MIT")
    expect(editable.manifest().keywords).toEqual(["webwriter-widget", "widget-lang-en", "widget-practical"])
    expect(editable.manifest().author).toEqual({name: "Ada Lovelace", email: "ada@example.test"})
    expect(editable.manifest().contributors).toEqual(["Grace Hopper <grace@example.test>"])
    expect(editable.manifest().customElements).toBe("custom-elements.json")
    expect(editable.manifest().editingConfig).toEqual({".": {label: {_: "Demo package"}}})
    expect((editor as any).localPackages[0].license).toBe("MIT")
    expect((editor as any).selectedLocalPackageName).toBe("@local/demo")
  })

  it("does not overwrite package metadata with invalid structured values", async() => {
    const editable = editableLocalPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(editable.directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()
    const originalContributors = editable.manifest().contributors

    await (editor as any).handleLocalPackageMetadataChange(new CustomEvent("local-package-metadata-change", {
      detail: {field: "contributors", value: "{not json}"},
    }))

    expect(editable.manifest().contributors).toEqual(originalContributors)
    expect((editor as any).localPackageError).toBe("Contributors must be valid JSON")
  })

  it("adds, edits, and removes compact contributor entries", async() => {
    const editable = editableLocalPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(editable.directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()

    await (editor as any).handleLocalPackageContributorAdd()
    expect(editable.manifest().contributors).toEqual([""])

    await (editor as any).handleLocalPackageContributorChange(new CustomEvent("local-package-contributor-change", {
      detail: {index: 0, value: '{"name":"Grace Hopper","email":"grace@example.test"}'},
    }))
    expect(editable.manifest().contributors).toEqual([{name: "Grace Hopper", email: "grace@example.test"}])

    await (editor as any).handleLocalPackageContributorDelete(new CustomEvent("local-package-contributor-delete", {
      detail: {index: 0},
    }))
    expect(editable.manifest().contributors).toBeUndefined()
  })

  it("creates, edits, changes the type of, and deletes package export cards", async() => {
    const editable = editableLocalPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(editable.directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()

    await (editor as any).handleLocalPackageExportAdd()
    expect(editable.manifest().exports).toMatchObject({
      "./widgets/new-widget.*": {
        source: "./src/widgets/new-widget.ts",
        default: "./dist/widgets/new-widget.*",
      },
    })

    await (editor as any).handleLocalPackageExportChange(new CustomEvent("local-package-export-change", {
      detail: {exportName: "./widgets/new-widget.*", field: "name", value: "secondary"},
    }))
    await (editor as any).handleLocalPackageExportChange(new CustomEvent("local-package-export-change", {
      detail: {exportName: "./widgets/secondary.*", field: "source", value: "./src/widgets/secondary.ts"},
    }))
    await (editor as any).handleLocalPackageExportChange(new CustomEvent("local-package-export-change", {
      detail: {exportName: "./widgets/secondary.*", field: "type", value: "test"},
    }))
    expect(editable.manifest().exports).toMatchObject({
      "./tests/secondary.*": {
        source: "./src/widgets/secondary.ts",
        default: "./dist/widgets/new-widget.*",
      },
    })
    expect((editable.manifest().exports as Record<string, unknown>)["./widgets/new-widget.*"]).toBeUndefined()

    await (editor as any).handleLocalPackageExportDelete(new CustomEvent("local-package-export-delete", {
      detail: {exportName: "./tests/secondary.*"},
    }))
    expect((editable.manifest().exports as Record<string, unknown>)["./tests/secondary.*"]).toBeUndefined()
  })

  it("picks an export source file relative to the package folder", async() => {
    const editable = editableLocalPackageDirectory()
    const fileHandle = {name: "picked.ts", kind: "file"}
    const resolve = vi.fn().mockResolvedValue(["src", "widgets", "picked.ts"])
    Object.assign(editable.directory, {resolve})
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(editable.directory))
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([fileHandle]))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()

    await (editor as any).handleLocalPackageExportFilePick(new CustomEvent("local-package-export-file-pick", {
      detail: {exportName: "./widgets/local-demo.*"},
    }))

    expect(resolve).toHaveBeenCalledWith(fileHandle)
    expect(editable.manifest().exports).toMatchObject({
      "./widgets/local-demo.*": {
        source: "./src/widgets/picked.ts",
        default: "./dist/local-demo.*",
      },
    })
  })

  it("honors the selected package's auto-reload setting", async() => {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(localPackageDirectory()))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const reload = vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()
    reload.mockClear()

    ;(editor as any).handleLocalPackageAutoReloadChange(new CustomEvent("local-package-auto-reload-change", {
      detail: {enabled: false},
    }))
    await (editor as any).performLocalPackageRefresh([...(editor as any).localPackageRecords.keys()][0])

    expect((editor as any).selectedLocalPackageAutoReload).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it("restores persisted directory handles and reloads their packages", async() => {
    const queryPermission = vi.fn().mockResolvedValue("prompt")
    const requestPermission = vi.fn().mockResolvedValue("granted")
    const directory = Object.assign(localPackageDirectory(), {queryPermission, requestPermission})
    vi.spyOn(LocalPackageWorkerClient.prototype, "storedDirectories").mockResolvedValue([{id: "persisted", handle: directory as any}])
    const start = vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const editor = new DomEditor()
    const watch = vi.spyOn(editor as any, "watchLocalPackage").mockResolvedValue(undefined)
    const reload = vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).restoreLocalPackages()

    expect(start).toHaveBeenCalledTimes(1)
    expect(watch).toHaveBeenCalledTimes(1)
    expect((editor as any).localPackages).toHaveLength(1)
    expect((editor as any).selectedLocalPackageName).toBe("@local/demo")
    expect(reload).toHaveBeenCalledWith([expect.objectContaining({name: "@local/demo"})])
    expect(queryPermission).toHaveBeenCalledWith({mode: "readwrite"})
    expect(requestPermission).toHaveBeenCalledWith({mode: "readwrite"})
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
    vi.spyOn(editor as any, "watchLocalPackage").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).restoreLocalPackages()

    expect((editor as any).localPackages[0].label).toBe("private-package")
    expect((editor as any).selectedLocalPackageName).toBe("@local/private-package")
    expect((editor as any).localPackageError).toContain("Select the folder again")
  })

  it("keeps a restored folder visible when renewed permission is denied", async() => {
    const directory = Object.assign(localPackageDirectory(), {
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission: vi.fn().mockResolvedValue("denied"),
    })
    const getFileHandle = vi.spyOn(directory, "getFileHandle")
    vi.spyOn(LocalPackageWorkerClient.prototype, "storedDirectories").mockResolvedValue([{id: "private", handle: directory as any}])
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const editor = new DomEditor()
    vi.spyOn(editor as any, "watchLocalPackage").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).restoreLocalPackages()

    expect(getFileHandle).not.toHaveBeenCalled()
    expect((editor as any).localPackages[0].label).toBe("demo-package")
    expect((editor as any).localPackageError).toContain("Grant access")
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
    const record = [...(editor as any).localPackageRecords.values()][0] as any

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
    const perform = vi.spyOn(editor as any, "performLocalPackageRefresh")
      .mockImplementationOnce(() => firstRefresh)
      .mockResolvedValue(undefined)

    const refreshing = (editor as any).refreshLocalPackage("local-id") as Promise<void>
    await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1))
    await (editor as any).refreshLocalPackage("local-id")
    finishFirst()
    await refreshing

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
    expect([...(editor as any).localPackageRecords.values()][0].monitor).toBeTruthy()
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
    body.append(paragraph)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect((editor as any).fileDirty).toBe(false)

    body.replaceChildren()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect((editor as any).fileDirty).toBe(false)
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
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const handle = {
      name: "lesson.html",
      getFile: vi.fn(),
      createWritable: vi.fn().mockResolvedValue({write, close}),
    }
    const picker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal("showSaveFilePicker", picker)
    const execute = vi.spyOn(editor, "execute").mockResolvedValue("<!DOCTYPE html><html><body><p>Saved</p></body></html>")
    ;(editor as any).fileDirty = true

    await (editor as any).saveDocument()

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      types: [
        {description: "HTML document (.html)", accept: {"text/html": [".html", ".htm"]}},
        {description: "Offline HTML document (.offline.html)", accept: {"text/html": [".offline.html"]}},
      ],
    }))
    expect(picker.mock.calls[0][0]).not.toHaveProperty("suggestedName")
    expect(execute).toHaveBeenCalledWith({type: "serializeDocument", offline: false})
    expect(handle.createWritable).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    const blob = write.mock.calls[0][0] as Blob
    await expect(blob.text()).resolves.toContain("<p>Saved</p>")
    expect(close).toHaveBeenCalledTimes(1)
    expect((editor as any).fileName).toBe("lesson")
    expect((editor as any).fileDirty).toBe(false)
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
    vi.spyOn(editor, "execute").mockResolvedValue("<!DOCTYPE html><html><body></body></html>")

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const save = ribbon.shadowRoot!.querySelector<RibbonButton>("ribbon-button.file-save-action")!
    await save.updateComplete
    save.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect((editor as any).fileHandle).toBe(handle))
    expect(picker).toHaveBeenCalledOnce()
  })

  it("opens an HTML file and associates its handle with the document", async () => {
    const {editor} = await mountEditor()
    const file = new File(["<!DOCTYPE html><html><body><p>Opened</p></body></html>"], "opened.html", {type: "text/html"})
    const handle = {name: "opened.html", getFile: vi.fn().mockResolvedValue(file), createWritable: vi.fn()}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
    const reload = vi.spyOn(editor as any, "reloadDocument").mockResolvedValue(undefined)

    await (editor as any).openDocument()

    expect(reload).toHaveBeenCalledWith(expect.stringContaining("<p>Opened</p>"))
    expect((editor as any).fileHandle).toBe(handle)
    expect((editor as any).fileName).toBe("opened")
    expect((editor as any).fileDirty).toBe(false)
  })

  it("strips excluded marks when opening HTML files and keeps rich base content", async () => {
    const {editor} = await mountEditor()
    const marks = excludedMarkNames.map(name => `<${name}><b>${name}</b><!--keep--></${name}>`).join("")
    const body = `<p>${marks}<ruby><rb>漢</rb><rp>(</rp><rt>かん</rt><rp>)</rp><rtc><rt>character</rt></rtc></ruby></p><test-widget><span>widget</span></test-widget>`
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
    expect(parsed.querySelector("p")?.innerHTML).toBe(excludedMarkNames.map(name => `<b>${name}</b><!--keep-->`).join("") + "漢")
    expect(parsed.querySelector("test-widget")?.innerHTML).toBe("<span>widget</span>")
    expect((editor as any).fileHandle).toBe(handle)
  })

  it("opens documents from the development backend when logged in", async () => {
    const {editor} = await mountEditor()
    const backend = {
      listDocuments: vi.fn().mockResolvedValue([{id: "doc-1", title: "Server lesson"}]),
      getDocument: vi.fn().mockResolvedValue({
        id: "doc-1",
        title: "Server lesson",
        content: "<!DOCTYPE html><html><body><p>From server</p></body></html>",
        format: "html",
      }),
    }
    ;(editor as any).backendClient = backend
    ;(editor as any).storageLocation = "development-server"
    Object.defineProperty(window, "prompt", {configurable: true, value: vi.fn().mockReturnValue("1")})
    const reload = vi.spyOn(editor as any, "reloadDocument").mockResolvedValue(undefined)

    await (editor as any).openDocument()

    expect(backend.getDocument).toHaveBeenCalledWith("doc-1")
    expect(reload).toHaveBeenCalledWith(expect.stringContaining("From server"))
    expect((editor as any).backendDocumentId).toBe("doc-1")
    expect((editor as any).fileName).toBe("Server lesson")
  })

  it("saves documents through the development backend by default after login", async () => {
    const {editor} = await mountEditor()
    const saved = {
      id: "doc-2",
      title: "Lesson",
      content: "<!DOCTYPE html><html><body><p>Saved remotely</p></body></html>",
      format: "html",
    }
    const backend = {createDocument: vi.fn().mockResolvedValue(saved), updateDocument: vi.fn()}
    ;(editor as any).backendClient = backend
    ;(editor as any).storageLocation = "development-server"
    ;(editor as any).fileName = "Lesson"
    ;(editor as any).fileDirty = true
    vi.spyOn(editor, "execute").mockResolvedValue(saved.content)

    await (editor as any).saveDocument()

    expect(backend.createDocument).toHaveBeenCalledWith({
      title: "Lesson",
      content: saved.content,
      format: "html",
    })
    expect((editor as any).backendDocumentId).toBe("doc-2")
    expect((editor as any).fileDirty).toBe(false)
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
    const execute = vi.spyOn(editor, "execute").mockResolvedValue("<html></html>")

    await (editor as any).saveDocument(true, "offline")

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      types: [
        {description: "HTML document (.html)", accept: {"text/html": [".html", ".htm"]}},
        {description: "Offline HTML document (.offline.html)", accept: {"text/html": [".offline.html"]}},
      ],
    }))
    expect(picker.mock.calls[0][0]).not.toHaveProperty("suggestedName")
    expect(execute).toHaveBeenCalledWith({type: "serializeDocument", offline: true})
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
    const {editor, editorWindow} = await mountEditor()
    const print = vi.fn()
    Object.defineProperty(editorWindow, "print", {configurable: true, value: print})

    ;(editor as any).printDocument()

    expect(print).toHaveBeenCalledTimes(1)
  })

  it("downloads the serialized document with the current file name", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute")
      .mockResolvedValue("<!DOCTYPE html><html><body><p>Downloaded</p></body></html>")
    const createObjectURL = vi.fn().mockReturnValue("blob:test")
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL})
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    ;(editor as any).fileName = "lesson"

    await (editor as any).downloadDocument()

    expect(execute).toHaveBeenCalledWith({type: "serializeDocument", offline: false})
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test")
  })
})

describe("DomEditor.execute()", () => {
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

  it("propagates package loading failures to actions waiting for the frame", async () => {
    const editor = new DomEditor()
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
  })

  it("does not post an action aborted while the editor frame is initializing", async () => {
    const editor = new DomEditor()
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

  it("executes the paragraph-format action from the Start ribbon", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()

    expect(execute).toHaveBeenCalledWith({type: "setBlockType", tag: "p"})
  })

  it("opens Edit after inserting an element with contextual edit options", async () => {
    const {editor, editorWindow} = await mountEditor()
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const selectInserted = (detail: object) => window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {inserted: true, ...detail}},
      source: editorWindow,
    }))

    selectInserted({
      path: [{path: [], name: "Document"}, {path: [0], name: "Table"}],
      table: {
        active: true,
        cellSelection: true,
        rows: 2,
        columns: 2,
        selectedCells: 1,
        canMerge: false,
        canSplit: false,
        hasCaption: false,
        selectedRowGroup: "tbody",
        rowGroups: [],
        canAddHeaderGroup: true,
        canAddFooterGroup: true,
        columnGroups: [],
        cellSemantics: {role: "data", headers: "", abbr: ""},
      },
    })
    expect(toolbox.activeTool).toBe("Edit")

    toolbox.selectTool(null)
    selectInserted({
      path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}],
      graphic: {active: true, capture: false},
    })
    expect(toolbox.activeTool).toBe("Edit")

    toolbox.selectTool(null)
    selectInserted({
      path: [{path: [], name: "Document"}, {path: [0], name: "Image"}],
      nodeSelected: true,
      media: {type: "picture", attributes: {alt: "Diagram"}},
    })
    expect(toolbox.activeTool).toBe("Edit")
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.media).toEqual({type: "picture", attributes: {alt: "Diagram"}})
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Image"]')).not.toBeNull()

    toolbox.selectTool(null)
    selectInserted({
      path: [{path: [], name: "Document"}, {path: [0], name: "Widget", icon: "Packages"}],
      nodeSelected: true,
    })
    expect(toolbox.activeTool).toBe("Edit")

    toolbox.selectTool(null)
    selectInserted({path: [{path: [], name: "Document"}, {path: [0], name: "Form"}]})
    expect(toolbox.activeTool).toBeNull()

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
    expect(search.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Search packages"]')).not.toBeNull()
    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).not.toBeNull()
    expect(button.shadowRoot!.querySelector('button[aria-label="Show more Demo options"]')).toBeNull()
  })

  it("installs an uninstalled package and then inserts its first member", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(demoPackage)
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect(insert).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).toHaveBeenCalledWith(demoPackage.members[0])
  })

  it("installs and inserts packages while package search is active", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(demoPackage)
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    await search.updateComplete
    const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.value = "demo"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect(install).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).toHaveBeenCalledWith(demoPackage.members[0])
    expect(button.shadowRoot!.querySelector(".corner-icon")).toBeNull()
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

  it("executes undo and redo from the top ribbon controls", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const historyButtons = Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".history-button"))

    expect(historyButtons.map(button => button.getAttribute("aria-label"))).toEqual(["Undo", "Redo"])
    expect(historyButtons[0].querySelector(".icon-tabler-arrow-back-up")).not.toBeNull()
    expect(historyButtons[1].querySelector(".icon-tabler-arrow-forward-up")).not.toBeNull()
    expect(historyButtons[1].parentElement?.nextElementSibling?.getAttribute("aria-label")).toBe("Preview")

    historyButtons[0].click()
    historyButtons[1].click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "undo"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "redo"})
  })

  it("opens Review in the toolbox with version cards and card restore actions", async () => {
    const {editor} = await mountEditor()
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    const user = {clientId: 7, name: "Ada Lovelace", initials: "AL", color: "#e11d48"}
    const otherUser = {clientId: 8, name: "Grace Hopper", initials: "GH", color: "#2563eb"}
    const currentTimestamp = Date.UTC(2026, 7, 19, 14, 35)
    const earlierTimestamp = Date.UTC(2026, 7, 18, 9, 5)
    const state: VersionHistoryState = {
      checkpoints: [{
        id: "current",
        timestamp: currentTimestamp,
        label: "Edited by Ada Lovelace",
        user,
        changes: {added: 1, removed: 0, modified: 1},
        commentCount: 0,
      }, {
        id: "earlier",
        timestamp: earlierTimestamp,
        label: "Document created",
        user: otherUser,
        changes: {added: 0, removed: 0, modified: 0},
        commentCount: 0,
      }],
      comments: [],
      preview: null,
      currentCheckpointId: "current",
      currentUserId: user.clientId,
    }
    const previewState: VersionHistoryState = {
      ...state,
      preview: {checkpointId: "earlier", added: 1, removed: 0, modified: 1, isCurrent: false},
    }
    const restoredState: VersionHistoryState = {
      ...state,
      currentCheckpointId: "earlier",
    }
    const resumedState = {...state, appliedQueuedChanges: true}
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "previewVersionCheckpoint") {
        return action.checkpointId === "current" ? resumedState : previewState
      }
      if(action.type === "revertVersionCheckpoint") return restoredState
      return state
    })
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!

    toolbox.selectTool("Review")
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "getVersionHistory"}))
    await toolbox.updateComplete

    expect(toolbox.activeTool).toBe("Review")
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll("ribbon-drawer")).map(drawer => drawer.getAttribute("label")))
      .toEqual(["Comments", "Review", "Versions"])
    expect(toolbox.shadowRoot!.querySelector(".history-change-panel")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".history-comments-panel")).toBeNull()

    const versionCards = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".history-version-card"))
    expect(versionCards).toHaveLength(2)
    expect(versionCards[0].querySelector(".history-checkpoint-label")?.textContent).toBe(
      `${new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(new Date(earlierTimestamp))} · ${new Intl.DateTimeFormat(undefined, {dateStyle: "medium"}).format(new Date(earlierTimestamp))}`,
    )
    expect(versionCards[0].querySelector(".history-checkpoint-meta")?.textContent).toBe("By Grace Hopper")
    expect(versionCards[1].querySelector(".history-checkpoint-meta")?.textContent).toBe("By you")
    expect(versionCards[1].textContent).not.toContain("Current")
    expect(versionCards[0].querySelector<HTMLButtonElement>(".history-card-restore-button")!.disabled).toBe(false)
    expect(versionCards[1].querySelector<HTMLButtonElement>(".history-card-restore-button")!.disabled).toBe(true)

    versionCards[0].querySelector<HTMLButtonElement>(".history-checkpoint")!.click()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "previewVersionCheckpoint",
      checkpointId: "earlier",
    }))
    await toolbox.updateComplete
    const restore = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(
      '.history-card-restore-button[data-checkpoint-id="earlier"]',
    )!
    await vi.waitFor(() => expect(restore.disabled).toBe(false))
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Preview"]')!.disabled).toBe(true)

    versionCards[1].querySelector<HTMLButtonElement>(".history-checkpoint")!.click()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "previewVersionCheckpoint",
      checkpointId: "current",
    }))
    await vi.waitFor(() => expect(
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.disabled,
    ).toBe(false))
    expect((editor as unknown as {fileDirty: boolean}).fileDirty).toBe(true)

    versionCards[0].querySelector<HTMLButtonElement>(".history-checkpoint")!.click()
    await vi.waitFor(() => expect(
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.disabled,
    ).toBe(true))
    restore.click()
    expect(execute).toHaveBeenCalledWith({type: "revertVersionCheckpoint", checkpointId: "earlier"})
    await vi.waitFor(() => expect(
      toolbox.shadowRoot!.querySelector('.history-version-card[data-after-current]'),
    ).not.toBeNull())
    await toolbox.updateComplete
    const restoredCards = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".history-version-card"))
    expect(restoredCards).toHaveLength(2)
    expect(restoredCards[0].hasAttribute("data-after-current")).toBe(false)
    expect(restoredCards[1].dataset.afterCurrent).toBe("")
    expect(restoredCards[0].querySelector<HTMLButtonElement>(".history-card-restore-button")!.disabled).toBe(true)
    expect(restoredCards[1].querySelector<HTMLButtonElement>(".history-card-restore-button")!.disabled).toBe(false)
    expect(restoredCards.some(card => card.textContent?.includes("Restored"))).toBe(false)

    scrollIntoView.mockClear()
    const newestTimestamp = Date.UTC(2026, 7, 19, 15, 5)
    toolbox.historyState = {
      ...restoredState,
      checkpoints: [{
        id: "newest",
        timestamp: newestTimestamp,
        label: "Edited by Ada Lovelace",
        user,
        changes: {added: 0, removed: 0, modified: 1},
        commentCount: 0,
      }, ...restoredState.checkpoints],
    }
    await toolbox.updateComplete
    const newestCard = toolbox.shadowRoot!.querySelector<HTMLElement>(
      '.history-version-card[data-checkpoint-id="newest"]',
    )!
    expect(newestCard).toBe(restoredCards[1].nextElementSibling)
    expect(scrollIntoView).toHaveBeenCalledWith({behavior: "smooth", block: "nearest", inline: "nearest"})
    expect(scrollIntoView.mock.instances.at(-1)).toBe(newestCard)

    toolbox.selectTool("Style")
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "clearVersionPreview"}))
    toolbox.selectTool("Review")
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "getVersionHistory"}))
    toolbox.selectTool(null)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "clearVersionPreview"}))
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

    expect(execute).toHaveBeenCalledWith({type: "insertMedia", media: "picture"})
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
        attribute: "alt",
        value: "Library",
      },
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setImageMapAreaAttribute",
      path: [1, 0],
      expected: {shape: "rect", coords: "1,2,3,4"},
      name: "alt",
      value: "Library",
    })
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

  it.each([
    ["media-capture:screen-image", {type: "captureMedia", mode: "screen-image"}],
    ["media-file:picture", {type: "insertMedia", media: "picture", selectFile: true}],
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

  it("routes semantic table controls through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
    const dispatch = (detail: object) => toolbox.dispatchEvent(new CustomEvent("table-semantic-action", {
      detail, bubbles: true, composed: true,
    }))

    dispatch({action: "convert-rows", group: "thead"})
    expect(execute).toHaveBeenCalledWith({type: "convertTableRows", group: "thead"})
    dispatch({action: "move-row-group", index: 2, expected: {"data-kind": "body"}, direction: -1})
    expect(execute).toHaveBeenCalledWith({
      type: "moveTableRowGroup", index: 2, expected: {"data-kind": "body"}, direction: -1,
    })
    dispatch({action: "set-column-span", path: [1, 0], expected: {span: "2"}, value: "3"})
    expect(execute).toHaveBeenCalledWith({
      type: "setTableColumnSpan", path: [1, 0], expected: {span: "2"}, value: "3",
    })
    dispatch({action: "set-cell-role", role: "column-header"})
    expect(execute).toHaveBeenCalledWith({type: "setTableCellRole", role: "column-header"})
    dispatch({action: "set-cell-attribute", attribute: "headers", value: "name value"})
    expect(execute).toHaveBeenCalledWith({
      type: "setTableCellSemanticAttribute", name: "headers", value: "name value",
    })
  })

  it("routes exact element attribute mutations through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!

    toolbox.dispatchEvent(new CustomEvent("element-attribute-change", {
      detail: {
        path: [0, 1],
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
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "data-source",
      previousName: "cite",
      value: "curriculum",
    })
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

    expect(execute).toHaveBeenNthCalledWith(1, {type: "insertGraphic"})
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

  it("renders presence circles before undo and overlaps up to three collaborators", async () => {
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

    expect(circles).toHaveLength(3)
    expect(circles.map(circle => circle.textContent)).toEqual(["AL", "GH", "LI"])
    expect(circles.map(circle => circle.style.getPropertyValue("--presence-color"))).toEqual([
      "#e11d48",
      "#2563eb",
      "#059669",
    ])
    expect(users.querySelector(".presence-more")).toBeNull()
    expect(users.nextElementSibling?.querySelector('[aria-label="Undo"]')).not.toBeNull()
  })

  it("adds a smaller Tabler plus circle with the connected peer count", async () => {
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
    const more = users.querySelector<HTMLElement>(".presence-more")!

    expect(users.querySelectorAll(".presence-user")).toHaveLength(3)
    expect(more.querySelector(".icon-tabler-plus")).not.toBeNull()
    expect(more.querySelector(".presence-more-count")?.textContent).toBe("4")
    expect(more.getAttribute("aria-label")).toBe("+ 4 peers connected")
    expect(users.dataset.userCount).toBe("4")
  })

  it("renders the preview control after redo with the WebWriter play icon", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const previewButton = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!

    expect(previewButton.getAttribute("aria-label")).toBe("Preview")
    expect(previewButton.previousElementSibling?.querySelector('[aria-label="Redo"]')).not.toBeNull()
    expect(previewButton.nextElementSibling).toBeNull()
    expect(previewButton.querySelector(".preview-icon")).not.toBeNull()
    expect(previewButton.querySelector(".icon-webwriter-preview")).not.toBeNull()
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
    expect(previewFrame.contentDocument!.body.getAttribute("contenteditable")).toBe("true")
    expect(previewFrame.contentDocument!.querySelector("p[contenteditable='true']")).not.toBeNull()
    expect(previewFrame.contentDocument!.designMode).not.toBe("on")
    expect(ribbon.shadowRoot!.querySelectorAll("ribbon-tab")).toHaveLength(1)
    expect(ribbon.shadowRoot!.querySelectorAll(".history-button")).toHaveLength(0)
    expect((ribbon as AppRibbon).expanded).toBe(true)
    const brand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    expect(brand.disabled).toBe(true)
    brand.click()
    expect(ribbon.previewActive).toBe(true)
    expect(ribbon.expanded).toBe(true)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.getAttribute("aria-label"))
      .toBe("Stop live session")
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.getAttribute("aria-pressed"))
      .toBe("true")
    expect(previewButton.querySelector(".preview-label")?.textContent).toBe("LIVE")
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Sharing"]')).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Learners"]')).not.toBeNull()
    expect(editor.shadowRoot!.querySelector("live-session-controls")).not.toBeNull()
    expect(editor.shadowRoot!.querySelector("live-session-overlay")).not.toBeNull()
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

  it("cancels media capture before hiding the editor frame for preview", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete

    expect(execute).toHaveBeenCalledWith({type: "cancelMediaCapture"})
    expect(iframe.hidden).toBe(true)
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

  it("includes the scoped registry before widget modules in preview", async () => {
    const {editor, iframe} = await mountEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    iframe.contentDocument!.body.innerHTML = '<demo-widget contenteditable="true"></demo-widget>'
    const previewHTML = (editor as unknown as {currentPreviewHTML(): string}).currentPreviewHTML()
    const parsed = new DOMParser().parseFromString(previewHTML, "text/html")
    const scripts = Array.from(parsed.querySelectorAll("script"))
    const policy = parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!
    const nonce = /'nonce-([^']+)'/.exec(policy)![1]
    expect(scripts.every(script => script.getAttribute("nonce") === nonce)).toBe(true)
    expect(scripts[0].src).toContain("@webcomponents/scoped-custom-element-registry@0.0.10/")
    expect(scripts.slice(1).map(script => script.src)).toEqual(demoPackage.scripts)
    expect(parsed.querySelector("demo-widget")?.getAttribute("contenteditable")).toBe("true")
    expect(previewHTML).not.toContain("◆")
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
        ?.querySelector(".preview-label")?.textContent).toBe("LIVE")

      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
      await editor.updateComplete
      await ribbon.updateComplete
      expect((ribbon as AppRibbon).expanded).toBe(true)
      expect(ribbon.hasAttribute("preview-transition")).toBe(true)
    }
  })

  it("keeps every learner in the live drawer and filters their combined visualization", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    const host = (editor as unknown as {liveSession: LiveSession}).liveSession
    const token = new URL((editor as unknown as {liveSessionLink: string}).liveSessionLink).searchParams.get("liveToken")!
    const learner = new LiveSession({
      id: host.id,
      role: "learner",
      token,
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
        'ribbon-drawer[label="Sharing"] ribbon-button[label="Share"]',
      )!
      const shareURL = new URL(share.qrValue)
      expect(shareURL.searchParams.get("liveSession")).toBe(host.id)
      expect(shareURL.searchParams.get("role")).toBe("learner")

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
      expect(editor.shadowRoot!.querySelector<LiveSessionControls>("live-session-controls")!.stepCount).toBe(1)

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
    const host = (editor as unknown as {liveSession: LiveSession}).liveSession
    const token = new URL((editor as unknown as {liveSessionLink: string}).liveSessionLink).searchParams.get("liveToken")!
    const learner = new LiveSession({
      id: host.id,
      role: "learner",
      token,
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

  it("keeps a learner widget's session path stable when siblings are inserted", async () => {
    const {editor, iframe} = await mountEditor()
    const previewDocument = iframe.contentDocument!
    previewDocument.body.innerHTML = "<demo-widget></demo-widget>"
    const sessionEditor = editor as unknown as {
      seedLiveWidgetPaths(document: Document): void
      captureLiveWidgetStates(document: Document): Array<{path?: number[]}>
    }
    sessionEditor.seedLiveWidgetPaths(previewDocument)
    previewDocument.body.prepend(previewDocument.createElement("p"))

    expect(sessionEditor.captureLiveWidgetStates(previewDocument)[0]?.path).toEqual([0])
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
    const sendPosition = async (position?: "absolute" | "fixed" | "relative" | "sticky") => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {path: [
          {path: [], name: "Document", positionAnchor: position === "absolute" || position === "fixed"},
          {path: [0, 0], name: "Paragraph", position,
            positionAnchor: position === "relative" || position === "sticky",
            sections: [{path: [0], type: "section", name: "Section", positionAnchor: position === "absolute"}]},
        ]}},
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
    expect(breadcrumb.shadowRoot!.querySelector('.tree-item[data-path="0,0"] sup .icons-tabler-filled')).not.toBeNull()
    await sendPosition()
    expect(breadcrumb.shadowRoot!.querySelector(".position-icons")).toBeNull()
  })

  it.each([
    {html: "<p>Hello</p>", rootPath: [], name: "Document"},
    {html: '<!--template-->\n<demo-widget role="document"><p>Hello</p></demo-widget>', rootPath: [2], name: "Content"},
  ])("opens the document toolbox when clicking the $name breadcrumb", async ({html, rootPath, name}) => {
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

    for(const activeTool of [null, "Style"] as const) {
      select([root, {path: [...rootPath, 0], name: "Paragraph"}])
      toolbox.selectTool(activeTool)
      await editor.updateComplete
      await breadcrumb.updateComplete

      breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>("button.item")!.click()
      await vi.waitFor(() => expect(toolbox.activeTool).toBe("Edit"))
      await editor.updateComplete
      await toolbox.updateComplete

      expect(execute).toHaveBeenCalledWith({type: "selectNode", path: rootPath})
      expect(toolbox.documentSelected).toBe(true)
      expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Metadata"]')).not.toBeNull()
    }
  })

  it("uses a document template as the breadcrumb tree root and exposes the Document toolbox", async () => {
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

    expect(breadcrumb.tree?.path).toEqual([0])
    expect(breadcrumb.tree?.children).toHaveLength(1)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item"))
      .map(button => button.textContent?.trim())).toEqual(["Content"])
    expect(toolbox.documentSelected).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!
      .getAttribute("aria-label")).toBe("Edit Document")
  })

  it("selects a breadcrumb section explicitly and opens its section toolbox", async () => {
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
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Section"]')).not.toBeNull()
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

  it("flattens sections in the document tree and shows their types beside structural items", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p>hello</p><section></section></div>"
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(breadcrumb.shadowRoot!.querySelector("nav")?.classList.contains("tree-nav")).toBe(true)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).toHaveLength(1)
    expect(breadcrumb.shadowRoot!.querySelector(".breadcrumb-list .item")?.textContent?.trim()).toBe("Document")
    expect(breadcrumb.shadowRoot!.querySelector(".breadcrumb-list .tree-toggle-separator")
      ?.previousElementSibling?.querySelector(".item-label")?.textContent?.trim()).toBe("Document")
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Paragraph",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".section-item"))
      .map(item => item.textContent).sort()).toEqual(["Division", "Section"])
    const paragraph = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,0"]')!
    expect(paragraph.closest(".tree-row")?.getAttribute("style")).toContain("--tree-depth: 0")
    paragraph.click()

    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [0, 0]})
  })

  it("omits mark wrappers from the document tree while retaining real descendants", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<p><b>bold</b><span><img></span></p>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-expander")!.click()
    await breadcrumb.updateComplete

    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Paragraph",
      "Image",
    ])
    expect(breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,1,0"]')).not.toBeNull()
  })

  it("hides picture implementation images and media sources from the document tree", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = `
      <picture><source srcset="small.png"><img src="large.png"></picture>
      <video><source src="movie.mp4"></video>
    `

    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children.map(child => child.name)).toEqual(["Image", "Video"])
    expect(tree.children[0].children).toEqual([])
    expect(tree.children[1].children).toEqual([])
  })

  it("opens the subtree represented by another breadcrumb separator", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><ul><li><p></p></li></ul><aside></aside></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {
              path: [0, 0],
              name: "List",
              icon: "List",
              sections: [{path: [0], type: "section", name: "Section", icon: "Section"}],
            },
            {path: [0, 0, 0], name: "List Item", icon: "Lists"},
            {path: [0, 0, 0, 0], name: "Paragraph", icon: "Paragraph"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const separators = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")
    expect(separators).toHaveLength(3)

    separators[1].click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).map(item => item.textContent?.trim())).toEqual([
      "Document",
      "List",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "List Item",
      "Paragraph",
    ])
    expect(breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,0,0"]')?.closest(".tree-row")?.getAttribute("style")).toContain("--tree-depth: 0")
  })

  it("shows a gap selection between tree items without adding a row", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<ul><li></li><li></li></ul>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "List", icon: "List"},
          ],
          gap: {parentPath: [0], offset: 1},
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    const marker = breadcrumb.shadowRoot!.querySelector<HTMLElement>(".tree-gap-indicator")!
    expect(marker.classList.contains("tree-gap-indicator-before")).toBe(true)
    expect(marker.closest(".tree-node")?.querySelector<HTMLButtonElement>('.tree-item[data-path="0,1"]')).not.toBeNull()
    expect(breadcrumb.shadowRoot!.querySelectorAll(".tree-node")).toHaveLength(3)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".tree-gap-indicator")).toHaveLength(1)
  })

  it("moves the open subtree to a higher selected element", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><ul><li><article><p></p></article></li></ul></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {
              path: [0, 0], name: "List", icon: "List",
              sections: [{path: [0], type: "section", name: "Section", icon: "Section"}],
            },
            {path: [0, 0, 0], name: "List Item", icon: "Lists"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")[2].click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {
              path: [0, 0], name: "List", icon: "List",
              sections: [{path: [0], type: "section", name: "Section", icon: "Section"}],
            },
            {path: [0, 0, 0], name: "List Item", icon: "Lists"},
            {
              path: [0, 0, 0, 0, 0], name: "Paragraph", icon: "Paragraph",
              sections: [{path: [0, 0, 0, 0], type: "article", name: "Article", icon: "Article"}],
            },
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).map(item => item.textContent?.trim())).toEqual([
      "Document",
      "List",
      "List Item",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Paragraph",
    ])
  })

  it("keeps the open tree on editor pointer interaction", async () => {
    const {editor, iframe} = await mountEditor()
    const focus = vi.spyOn(iframe, "focus")
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    iframe.contentDocument!.dispatchEvent(new Event("pointerdown", {bubbles: true}))
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
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

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
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

    const treeToggle = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")
    treeToggle?.click()
    await breadcrumb.updateComplete
    const treeItem = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0"]')!
    expect(treeItem.classList.contains("node-selected")).toBe(true)
    expect(treeItem.classList.contains("capture-selected")).toBe(true)
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await breadcrumb.updateComplete

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {...detail, capture: false}},
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete
    const updatedItems = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")
    expect(updatedItems[1].classList.contains("capture-selected")).toBe(false)
    expect(updatedItems[1].classList.contains("node-selected")).toBe(true)
    expect(treeItem.classList.contains("node-selected")).toBe(true)
    expect(treeItem.classList.contains("capture-selected")).toBe(false)

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
      const unmarkedTreeItem = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0"]')!
      expect(unmarkedItems[1].classList.contains("node-selected")).toBe(false)
      expect(unmarkedItems[1].classList.contains("capture-selected")).toBe(false)
      expect(unmarkedTreeItem.classList.contains("node-selected")).toBe(false)
      expect(unmarkedTreeItem.classList.contains("capture-selected")).toBe(false)
    }
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

  it("starts and ends an element hover from a breadcrumb item", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const item = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>("button.item")!

    item.dispatchEvent(new MouseEvent("mouseenter"))
    item.dispatchEvent(new MouseEvent("mouseleave"))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "hoverNode", path: []})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "hoverNode", path: null})
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

  it("expands the closed toolbox background with the breadcrumb and keeps open panes attached to their tabs", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const tabs = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const tabsArea = tabs.parentElement!
    const stage = editor.shadowRoot!.querySelector<HTMLElement>(".document-stage")!
    expect(getComputedStyle(breadcrumb).gridColumn).toBe("1")
    expect(getComputedStyle(toolbox).gridColumn).toBe("2")
    expect(getComputedStyle(toolbox).gridRow).toBe("2")
    expect(getComputedStyle(stage).gridColumn).toBe("1 / -1")
    expect(tabsArea.className).toBe("toolbox-tabs-area")
    expect(getComputedStyle(tabsArea).gridRow).toBe("1 / -1")
    expect(getComputedStyle(tabsArea).backgroundColor).toBe(getComputedStyle(breadcrumb).backgroundColor)
    expect(getComputedStyle(tabs).alignItems).toBe("flex-end")
    expect(getComputedStyle(tabs).backgroundColor).toBe(getComputedStyle(breadcrumb).backgroundColor)
    expect(getComputedStyle(tabs).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(toolbox).gridTemplateRows).toBe("30px minmax(0, 1fr)")
    expect(getComputedStyle(tabs).borderBottomColor).toBe("#a8a8a8")
    expect(getComputedStyle(tabs).height).toBe("30px")

    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(getComputedStyle(tabs).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tabs).height).toBe("30px")

    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    expect(getComputedStyle(toolbox).gridRow).toBe("2 / 4")
    expect(getComputedStyle(toolbox).gridTemplateRows).toBe("30px minmax(0, 1fr)")
    expect(getComputedStyle(tabsArea).gridRow).toBe("1")
    expect(getComputedStyle(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!).gridRow).toBe("2")
    expect(getComputedStyle(tabs).backgroundColor).toBe(getComputedStyle(breadcrumb).backgroundColor)

    toolbox.selectTool(null)
    await toolbox.updateComplete
    expect(getComputedStyle(tabsArea).gridRow).toBe("1 / -1")
    expect(getComputedStyle(tabs).height).toBe("30px")

    vi.useFakeTimers()
    try {
      breadcrumb.collapseTree()
      await breadcrumb.updateComplete
      expect(breadcrumb.hasAttribute("tree-open")).toBe(false)
      expect(breadcrumb.hasAttribute("tree-animating")).toBe(true)

      await vi.advanceTimersByTimeAsync(179)
      expect(breadcrumb.hasAttribute("tree-animating")).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      await breadcrumb.updateComplete
      expect(breadcrumb.hasAttribute("tree-animating")).toBe(false)
    }
    finally { vi.useRealTimers() }
    expect(getComputedStyle(tabs).borderBottomColor).toBe("#a8a8a8")
  })

  it("collapses the breadcrumb tree when the ribbon is collapsed", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
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

    heading.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Heading"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "setBlockType", tag: "h1"})

    heading.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    await submenu.updateComplete
    submenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Heading 3"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "setBlockType", tag: "h3"})

    heading.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    submenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Divider"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<hr>"})
  })

  it("applies or changes a section type without form insertion", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    expect(ribbon.shadowRoot!.querySelector('ribbon-button[label="Form"]')).toBeNull()
    const section = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Section"]')!
    ribbon.canSection = true
    await ribbon.updateComplete
    await section.updateComplete
    section.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(execute).toHaveBeenCalledWith({type: "toggleSection", section: "section"})

    section.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await section.updateComplete
    const sectionType = section.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Type"]')!
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

    expect(execute).toHaveBeenCalledWith({type: "setBlockType", tag: "p"})
  })

  it.each(["p", "pre"])("converts %s from the paragraph toolbox switch", async tag => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.elementAttributes = {
      path: [0], localName: tag, namespaceURI: "http://www.w3.org/1999/xhtml",
      name: tag === "p" ? "Paragraph" : "Preformatted Text", attributes: {},
    }
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const toggle = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[role="switch"]')!
    expect(toggle.checked).toBe(tag === "pre")
    toggle.click()

    expect(execute).toHaveBeenCalledWith({type: "setBlockType", tag: tag === "p" ? "pre" : "p"})
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

  it("does not expose Insert as a collapsed ribbon menu", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete

    expect(ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector("ribbon-menu")?.hidden).toBe(true)
  })
})
