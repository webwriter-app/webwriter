// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {loadWidgetsMessage} from "../editor-bridge"
import {WebWriterPackageRegistry, type WebWriterPackage} from "../packages"
import {DependencyFeature} from "./dependencies"

const demoPackage: WebWriterPackage = {
  name: "@webwriter/demo",
  version: "1.2.3",
  label: "Demo",
  authors: [],
  keywords: ["webwriter-widget"],
  links: {},
  scripts: ["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.js"],
  styles: ["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.css"],
  editingConfig: {
    "./widgets/webwriter-demo": {content: "webwriter-demo-item+"},
    "./widgets/webwriter-demo-item": {group: "", content: "flow*", isolating: false},
  },
  members: [{
    id: "@webwriter/demo@1.2.3:./widgets/webwriter-demo",
    packageName: "@webwriter/demo",
    packageVersion: "1.2.3",
    exportName: "./widgets/webwriter-demo.*",
    kind: "widget",
    label: "Demo Widget",
    insertable: true,
    tagName: "webwriter-demo",
  }, {
    id: "@webwriter/demo@1.2.3:./widgets/webwriter-demo-item",
    packageName: "@webwriter/demo",
    packageVersion: "1.2.3",
    exportName: "./widgets/webwriter-demo-item.*",
    kind: "widget",
    label: "Demo Item",
    insertable: false,
    tagName: "webwriter-demo-item",
  }],
}

afterEach(() => {
  document.head.querySelectorAll(".◆editor-only").forEach(element => element.remove())
  document.body.replaceChildren()
  globalThis.DOMEDITOR_PACKAGE_ITEMS = []
  vi.restoreAllMocks()
})

describe("DependencyFeature", () => {
  it("uses the current iframe's observer realm during feature startup", () => {
    const outerDocument = document
    const outerObserver = MutationObserver
    const frame = document.createElement("iframe")
    document.body.append(frame)
    const frameDocument = frame.contentDocument!
    class RejectingOuterObserver {
      constructor(_callback: MutationCallback) {}
      observe() {
        throw new TypeError("An outer-realm observer cannot observe an iframe node")
      }
      disconnect() {}
      takeRecords() { return [] }
    }
    Object.defineProperty(globalThis, "document", {configurable: true, writable: true, value: frameDocument})
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      writable: true,
      value: RejectingOuterObserver,
    })

    let feature: DependencyFeature | undefined
    try {
      feature = new DependencyFeature({} as DOMEditor)
      expect(() => feature!.enable()).not.toThrow()
    }
    finally {
      feature?.disable()
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: outerDocument,
      })
      Object.defineProperty(globalThis, "MutationObserver", {
        configurable: true,
        writable: true,
        value: outerObserver,
      })
      frame.remove()
    }
  })

  it("waits for every remote asset before completing widget loading", async () => {
    const append = vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()
    let settled = false
    const pending = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
    }).then(() => { settled = true })

    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    const assets = append.mock.calls.flat().filter((asset): asset is HTMLElement => asset instanceof HTMLElement)
    expect(assets).toHaveLength(2)
    await Promise.resolve()
    expect(settled).toBe(false)

    assets[0].dispatchEvent(new Event("load"))
    await Promise.resolve()
    expect(settled).toBe(false)
    assets[1].dispatchEvent(new Event("load"))
    await expect(pending).resolves.toBeUndefined()
    editor.destroy()
  })

  it("rejects when a remote asset reports an error", async () => {
    const append = vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()
    const pending = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
    })
    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    const script = append.mock.calls.flat().find((asset): asset is HTMLScriptElement => asset instanceof HTMLScriptElement)!
    script.dispatchEvent(new Event("error"))
    await expect(pending).rejects.toThrow("Package script failed to load")
    editor.destroy()
  })

  it("settles a superseded asset barrier", async () => {
    vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()
    const first = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
    })
    await Promise.resolve()
    const second = editor.getActionHandler(loadWidgetsMessage)({type: loadWidgetsMessage, widgets: [], packages: []})
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    editor.destroy()
  })

  it("creates pinned CDN styles and scripts for bridged widgets", async () => {
    const getPackage = vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    const append = vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()

    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.2.3"}],
    })

    expect(getPackage).toHaveBeenCalledWith({name: "@webwriter/demo", version: "1.2.3"})
    const assets = append.mock.calls.flat()
    const style = assets.find((asset): asset is HTMLLinkElement => asset instanceof HTMLLinkElement)!
    const script = assets.find((asset): asset is HTMLScriptElement => asset instanceof HTMLScriptElement)!
    expect(style.href).toBe("https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.css")
    expect(script.src).toBe("https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.js")
    expect(style.nonce).toBe(editor.trustedScriptNonce)
    expect(script.nonce).toBe(editor.trustedScriptNonce)
    expect(globalThis.DOMEDITOR_PACKAGE_ITEMS).toEqual([
      expect.objectContaining({name: "Demo Widget", tag: "webwriter-demo"}),
    ])
    editor.destroy()
  })

  it("uses supplied local package metadata without querying npm", async () => {
    const localPackage: WebWriterPackage = {
      ...demoPackage,
      scripts: ["https://example.test/__webwriter/local-packages/demo/dist/demo.js"],
      styles: ["https://example.test/__webwriter/local-packages/demo/dist/demo.css"],
    }
    const getPackage = vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage")
    const append = vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()

    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: localPackage.name, version: localPackage.version}],
      packages: [localPackage],
    })

    expect(getPackage).not.toHaveBeenCalled()
    const assets = append.mock.calls.flat()
    expect(assets.find((asset): asset is HTMLScriptElement => asset instanceof HTMLScriptElement)?.src)
      .toBe(localPackage.scripts[0])
    editor.destroy()
  })

  it("reports a local bundle that fails to load", async () => {
    const localPackage: WebWriterPackage = {
      ...demoPackage,
      scripts: ["https://example.test/__webwriter/local-packages/demo/dist/demo.js"],
      styles: [],
    }
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLScriptElement && asset.dispatchEvent(new Event("error"))))
    })
    const editor = new DOMEditor()

    await expect(editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: localPackage.name, version: localPackage.version}],
      packages: [localPackage],
    })).rejects.toThrow("Local package script failed to load")
    editor.destroy()
  })

  it("settles pending local asset loads when the feature is destroyed", async () => {
    const localPackage: WebWriterPackage = {
      ...demoPackage,
      scripts: ["https://example.test/__webwriter/local-packages/demo/dist/demo.js"],
      styles: [],
    }
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()
    const pending = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: localPackage.name, version: localPackage.version}],
      packages: [localPackage],
    })
    editor.destroy()
    await expect(pending).resolves.toBeUndefined()
  })

  it("rebuilds the schema from editingConfig and makes nested widget content editable", async () => {
    vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()
    document.body.innerHTML = "<webwriter-demo><webwriter-demo-item><p>Nested text</p></webwriter-demo-item></webwriter-demo>"

    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.2.3"}],
    })

    const widget = document.querySelector("webwriter-demo")!
    const item = document.querySelector("webwriter-demo-item")!
    expect(editor.schema.get("webwriter-demo")).toBeDefined()
    expect(editor.schema.get("webwriter-demo-item").inseperable).toBe(false)
    expect(editor.schema.isContentValid(widget)).toBe(true)
    expect(editor.schema.isContentValid(item)).toBe(true)
    expect(widget.getAttribute("contenteditable")).toBe("true")
    expect(item.getAttribute("contenteditable")).toBe("true")

    const remoteItem = document.createElement("webwriter-demo-item")
    remoteItem.append(document.createElement("p"))
    widget.append(remoteItem)
    await new Promise<void>(resolve => queueMicrotask(resolve))
    expect(remoteItem.getAttribute("contenteditable")).toBe("true")

    await editor.getActionHandler(loadWidgetsMessage)({type: loadWidgetsMessage, widgets: []})
    expect(editor.schema.get("webwriter-demo")).toBeUndefined()
    editor.destroy()
  })
})
