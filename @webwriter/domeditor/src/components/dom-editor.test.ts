// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import type {AppRibbon} from "./ribbon"
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
} from "../editor-bridge"
import {WEBWRITER_GENERATOR, emptyDocumentHeadState} from "../document-head"
import {INSTALLED_PACKAGES_STORAGE_KEY, WebWriterPackageRegistry, type WebWriterPackage} from "../packages"
import {LocalPackageWorkerClient} from "../local-package-worker-client"

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

async function mountEditor() {
  const editor = new DomEditor()
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

afterEach(() => {
  document.body.replaceChildren()
  localStorage.removeItem(INSTALLED_PACKAGES_STORAGE_KEY)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

describe("DomEditor iframe setup", () => {
  it("starts new documents with the current WebWriter generator metadata", async () => {
    const {iframe} = await mountEditor()

    expect(iframe.contentDocument!.head.querySelector('meta[name="generator"]')?.getAttribute("content"))
      .toBe(WEBWRITER_GENERATOR)
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
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    expect(ribbon.documentHead.title).toBe("Head title")

    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    ribbon.dispatchEvent(new CustomEvent("document-head-action", {
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
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage")
    iframe.dispatchEvent(new Event("load"))

    expect(search).toHaveBeenCalledTimes(1)
    expect((editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages).toEqual([demoPackage])

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
      requestId: expect.any(String),
    }), "*")
  })

  it("does not sandbox the editor iframe", async () => {
    const {iframe} = await mountEditor()

    expect(iframe.hasAttribute("sandbox")).toBe(false)
  })

  it("passes the sync URL to the editor through the bridge", async () => {
    const originalUrl = location.href
    history.replaceState({}, "", "/?session=collab-demo&source=local")

    try {
      const editor = new DomEditor()
      document.body.append(editor)
      await editor.updateComplete
      const iframe = editor.shadowRoot!.querySelector("iframe")!
      const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage")

      iframe.dispatchEvent(new Event("load"))

      expect(postMessage).toHaveBeenCalledWith({
        type: initializeEditorMessage,
        syncUrl: "ws://localhost:1234/?session=collab-demo&source=local",
      }, "*")
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
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage")
    const srcdoc = (editor as unknown as {readonly editorSrcdoc: string}).editorSrcdoc

    iframe.dispatchEvent(new Event("load"))

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.0.0"}],
      packages: [demoPackage],
      requestId: expect.any(String),
    }), "*")
    const polyfillUrl = "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js"
    expect(srcdoc).toContain(`<script data-webwriter-editor-only src="${polyfillUrl}"></script>`)
    expect(srcdoc.indexOf(polyfillUrl)).toBeLessThan(srcdoc.indexOf("editor-entry"))
    expect(srcdoc).not.toContain("Demo Widget")
  })

  it("restores original resource URLs before loading an offline document", () => {
    const editor = new DomEditor()
    ;(editor as any).frameDocumentHTML = '<!DOCTYPE html><html><head><script data-webwriter-original-src="/app.js">inline()</script></head><body><img data-webwriter-original-src="photo.png" src="data:image/png;base64,AQID"></body></html>'

    const srcdoc = (editor as any).editorSrcdoc as string

    expect(srcdoc).toContain('<script src="/app.js"></script>')
    expect(srcdoc).toContain('src="photo.png"')
    expect(srcdoc).not.toContain("data-webwriter-original-src")
  })

  it("persists package additions and removals", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue({update: []})
    vi.spyOn((editor as any).packageRegistry, "getPackage").mockResolvedValue(demoPackage)

    const adding = (editor as any).setPackageInstalled(demoPackage, true) as Promise<unknown>
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe")?.getAttribute("srcdoc")).toContain("<!-- frame 1 -->"))
    editor.shadowRoot!.querySelector("iframe")!.dispatchEvent(new Event("load"))
    await adding

    expect(JSON.parse(localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY)!)).toEqual([demoPackage])

    const removing = (editor as any).setPackageInstalled(demoPackage, false) as Promise<unknown>
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe")?.getAttribute("srcdoc")).toContain("<!-- frame 2 -->"))
    editor.shadowRoot!.querySelector("iframe")!.dispatchEvent(new Event("load"))
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

  it("writes editable metadata back to package.json", async() => {
    const editable = editableLocalPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(editable.directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()

    await (editor as any).handleLocalPackageMetadataChange(new CustomEvent("local-package-metadata-change", {
      detail: {field: "license", value: "MIT"},
    }))

    expect(editable.manifest().license).toBe("MIT")
    expect((editor as any).localPackages[0].license).toBe("MIT")
    expect((editor as any).selectedLocalPackageName).toBe("@local/demo")
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
    const directory = localPackageDirectory()
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

  it("tracks an empty paragraph as a change once the document has been saved", async () => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))
    ;(editor as any).fileHandle = {name: "saved.html"}

    iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("p"))

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
    expect(postMessage).toHaveBeenCalledWith({type: "lift", requestId: "1"}, "*")
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

  it("executes the matching insert action from the expanded Insert ribbon", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<p></p>"})
  })

  it("renders Packages as ribbon buttons with a prefixed search bar", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
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
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect(insert).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).toHaveBeenCalledWith(demoPackage.members[0])
  })

  it("only installs or removes packages while package search is active", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(demoPackage)
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
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
    expect(insert).not.toHaveBeenCalled()
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

    expect(historyButtons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Undo",
      "Redo",
    ])
    expect(historyButtons[0].querySelector(".icon-tabler-arrow-back-up")).not.toBeNull()
    expect(historyButtons[1].querySelector(".icon-tabler-arrow-forward-up")).not.toBeNull()
    expect(historyButtons[1].nextElementSibling?.getAttribute("aria-label")).toBe("Preview")

    historyButtons[0].click()
    historyButtons[1].click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "undo"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "redo"})
  })

  it("routes media ribbon commands through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "Image"},
      bubbles: true,
      composed: true,
    }))

    expect(execute).toHaveBeenCalledWith({type: "insertMedia", media: "picture"})
    await Promise.resolve()
    focusEditor.mockClear()

    ribbon.dispatchEvent(new CustomEvent("media-type-change", {
      detail: {type: "object"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "switchWebsiteType", website: "object"})

    ribbon.dispatchEvent(new CustomEvent("media-attribute-change", {
      detail: {type: "object", attribute: "data", value: "https://example.test"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setMediaAttribute",
      name: "data",
      value: "https://example.test",
    })
    await Promise.resolve()
    expect(focusEditor).not.toHaveBeenCalled()
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

  it("renders the preview control after redo with the filled play icon", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const previewButton = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!

    expect(previewButton.getAttribute("aria-label")).toBe("Preview")
    expect(previewButton.previousElementSibling?.getAttribute("aria-label")).toBe("Redo")
    expect(previewButton.nextElementSibling?.getAttribute("aria-label")).toBe("Collapse ribbon")
    expect(previewButton.querySelector(".preview-icon")).not.toBeNull()
    expect(previewButton.querySelector(".icon-tabler-player-play.icons-tabler-filled")).not.toBeNull()
  })

  it("shows a static preview and restores the live editor selection on exit", async () => {
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
    expect(previewFrame.contentDocument!.body.getAttribute("contenteditable")).toBeNull()
    expect(previewFrame.contentDocument!.querySelector("[contenteditable]")).toBeNull()
    expect(previewFrame.contentDocument!.designMode).not.toBe("on")
    expect(ribbon.shadowRoot!.querySelectorAll("ribbon-tab")).toHaveLength(1)
    expect(ribbon.shadowRoot!.querySelectorAll(".history-button")).toHaveLength(0)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ribbon-toggle")!.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.getAttribute("aria-label"))
      .toBe("Exit preview")
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.getAttribute("aria-pressed"))
      .toBe("true")
    expect(previewButton.querySelector(".preview-label")?.textContent).toBe("PREVIEW")

    previewFrame.contentDocument!.body.textContent = "Preview changes are discarded"
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
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

  it("exits preview from the file tab", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    expect((editor as unknown as {previewActive: boolean}).previewActive).toBe(false)
    expect(ribbon.shadowRoot!.querySelectorAll("ribbon-tab")).toHaveLength(4)
  })

  it("keeps repeated preview toggles on the same ribbon animation path", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    for(let cycle = 0; cycle < 3; cycle++) {
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
      await editor.updateComplete
      await ribbon.updateComplete
      expect((ribbon as AppRibbon).expanded).toBe(false)
      expect(ribbon.hasAttribute("preview-transition")).toBe(true)
      expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")
        ?.querySelector(".preview-label")?.textContent).toBe("PREVIEW")

      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
      await editor.updateComplete
      await ribbon.updateComplete
      expect((ribbon as AppRibbon).expanded).toBe(true)
      expect(ribbon.hasAttribute("preview-transition")).toBe(true)
    }
  })

  it("renders the current selection path received from the editor bridge", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><span></span><p></p></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 1], name: "Paragraph", icon: "Paragraph"},
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
      "Section",
      "Paragraph",
    ])
    expect(breadcrumb.shadowRoot!.querySelectorAll(".separator")).toHaveLength(2)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".separator-icon svg")).toHaveLength(2)
    expect(buttons[0].parentElement?.nextElementSibling?.classList.contains("tree-toggle-separator")).toBe(true)
    expect(buttons[2].parentElement?.nextElementSibling).toBeNull()
    expect(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item-icon svg")).toHaveLength(3)
  })

  it("renders package widget names and icons in breadcrumbs and the document tree", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    iframe.contentDocument!.body.innerHTML = "<webwriter-demo></webwriter-demo>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
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

  it("opens an expandable document tree from the Document separator", async () => {
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
    expect(breadcrumb.shadowRoot!.querySelector(".breadcrumb-list .tree-toggle-separator")?.previousElementSibling?.textContent?.trim()).toBe("Document")
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Section",
    ])

    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-expander")[0].click()
    await breadcrumb.updateComplete

    const treeItems = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-item"))
    expect(treeItems.map(item => item.textContent?.trim())).toEqual([
      "Section",
      "Paragraph",
      "Section",
    ])
    const paragraph = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,0"]')!
    expect(paragraph.closest(".tree-row")?.getAttribute("style")).toContain("--tree-depth: 1")
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
    iframe.contentDocument!.body.innerHTML = "<section><p></p><aside></aside></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 1], name: "Sidebar", icon: "Layout"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const separators = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")
    expect(separators).toHaveLength(2)

    separators[1].click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).map(item => item.textContent?.trim())).toEqual([
      "Document",
      "Section",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Paragraph",
      "Sidebar",
    ])
    expect(breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,0"]')?.closest(".tree-row")?.getAttribute("style")).toContain("--tree-depth: 0")
  })

  it("shows a gap selection between tree items without adding a row", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><p></p><aside></aside></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
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
    iframe.contentDocument!.body.innerHTML = "<section><div><article><p></p></article></div><span></span></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 0], name: "Section", icon: "Section"},
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
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 0], name: "Section", icon: "Section"},
            {path: [0, 0, 0], name: "Article", icon: "Article"},
            {path: [0, 0, 0, 0], name: "Paragraph", icon: "Paragraph"},
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
      "Section",
      "Section",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Article",
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
    await breadcrumb.updateComplete

    const items = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")
    expect(items[0].classList.contains("node-selected")).toBe(false)
    expect(items[1].classList.contains("node-selected")).toBe(true)
    expect(items[0].classList.contains("capture-selected")).toBe(false)
    expect(items[1].classList.contains("capture-selected")).toBe(true)
    const styles = (DomEditorBreadcrumb.styles as unknown as {cssText: string}).cssText
    expect(styles).toContain("text-decoration-style: dotted")
    expect(styles).toContain("text-decoration-style: solid")
    expect(styles).toContain("#38bdf8")

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
    const tab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!
    const button = tab.shadowRoot!.querySelector("button")!
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
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()
    await execute.mock.results[0].value

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
  })

  it("uses one Heading ribbon button with a submenu for the other heading levels", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Heading"]')!
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Text"] ribbon-button[label="Heading 2"]')).toBeNull()
    await heading.updateComplete

    heading.shadowRoot!.querySelector('button[title="Heading"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<h1></h1>"})

    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    await submenu.updateComplete
    submenu.shadowRoot!.querySelector('button[title="Heading 3"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<h3></h3>"})

    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    submenu.shadowRoot!.querySelector('button[title="Divider"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<hr>"})
  })

  it("inserts form, section, and their grouped element choices", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const form = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Interactive"] ribbon-button[label="Form"]',
    )!
    const section = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Text"] ribbon-button[label="Section"]',
    )!
    await Promise.all([form.updateComplete, section.updateComplete])

    form.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    section.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(execute).toHaveBeenNthCalledWith(1, {type: "insert", html: "<form></form>"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "insert", html: "<section></section>"})

    form.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await form.updateComplete
    const formMenu = form.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await formMenu.updateComplete
    formMenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Text Field"]')!.click()
    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<input>"})

    section.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await section.updateComplete
    const sectionMenu = section.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await sectionMenu.updateComplete
    sectionMenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Address"]')!.click()
    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<address></address>"})
  })

  it("inserts script and its grouped element choices", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const script = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Interactive"] ribbon-button[label="Script"]',
    )!
    await script.updateComplete

    script.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<script></script>"})

    script.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await script.updateComplete
    const menu = script.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Slot"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<slot></slot>"})
  })

  it("inserts dialog from the Details dropdown", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const details = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Text"] ribbon-button[label="Details"]',
    )!
    await details.updateComplete
    details.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await details.updateComplete
    const menu = details.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Dialog"]')!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<dialog></dialog>"})
  })

  it("puts Preformatted Text in the Paragraph submenu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Paragraph options"]')!.click()
    await paragraph.updateComplete
    const submenu = paragraph.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    submenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Preformatted Text"]')!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<pre></pre>"})
  })

  it("closes expanded ribbon-button menus when the editor receives focus", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Heading"]')!
    await heading.updateComplete
    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete

    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    expect(submenu.hidden).toBe(false)
    iframe.contentDocument!.dispatchEvent(new Event("focusin", {bubbles: true}))
    await heading.updateComplete

    expect(submenu.hidden).toBe(true)
  })

  it("executes the matching insert action from the collapsed Insert menu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    const paragraph = menu.shadowRoot!.querySelector('button[title="Paragraph"]')!
    paragraph.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<p></p>"})
  })

  it("renders heading levels 2 to 6 as a submenu in the collapsed Insert menu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete

    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).toBeNull()
    menu.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await menu.updateComplete
    menu.shadowRoot!.querySelector('button[title="Heading 2"]')!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<h2></h2>"})
  })

  it("closes Insert submenus when the collapsed ribbon menu closes", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).not.toBeNull()

    ribbon.menuOpen = false
    await ribbon.updateComplete
    ribbon.menuOpen = true
    await ribbon.updateComplete
    await menu.updateComplete

    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).toBeNull()
  })
})
