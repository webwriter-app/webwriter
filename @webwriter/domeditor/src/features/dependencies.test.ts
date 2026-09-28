// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {loadWidgetsMessage} from "../editor-bridge"
import {packageCdnUrl, SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL, WebWriterPackageRegistry, type WebWriterPackage} from "../packages"
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
  document.head.querySelectorAll(".◆editor-only, script[src], link[rel='stylesheet']").forEach(element => element.remove())
  document.body.replaceChildren()
  globalThis.DOMEDITOR_PACKAGE_ITEMS = []
  vi.restoreAllMocks()
})

describe("DependencyFeature", () => {
  it("registers a supplied import map before widget modules and exports it", async () => {
    const pkg: WebWriterPackage = {
      ...demoPackage,
      manifest: {name: demoPackage.name, version: demoPackage.version},
    }
    const append = vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()
    const pending = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: pkg.name, version: pkg.version}],
      packages: [pkg],
      importMap: {imports: {lit: "https://cdn.example/lit.js"}},
    })
    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    expect(document.head.firstElementChild?.id).toBe("webwriter-package-importmap")
    append.mock.calls.flat().forEach(asset => (asset as HTMLElement).dispatchEvent(new Event("load")))
    await expect(pending).resolves.toBeUndefined()
    document.body.innerHTML = "<webwriter-demo></webwriter-demo>"
    const exported = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    expect(exported.querySelector('script[type="importmap"]')?.textContent).toContain("https://cdn.example/lit.js")
    const children = Array.from(exported.head.children)
    expect(children.findIndex(element => element.matches('script[type="importmap"]')))
      .toBeLessThan(children.findIndex(element => element.matches('script[type="module"][src]')))
    editor.destroy()
  })

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
      importMap: {},
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
      importMap: {},
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
    })
    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    const script = append.mock.calls.flat().find((asset): asset is HTMLScriptElement => asset instanceof HTMLScriptElement)!
    script.dispatchEvent(new Event("error"))
    await expect(pending).rejects.toThrow("Package script failed to load")
    editor.destroy()
  })

  it("treats a missing cached wildcard stylesheet as optional after the bundle settles", async () => {
    const cachedPackage: WebWriterPackage = {
      ...demoPackage,
      name: "@webwriter/cached",
      version: "1.0.0",
      scripts: [packageCdnUrl("@webwriter/cached", "1.0.0", "./dist/cached-widget.js")],
      styles: [packageCdnUrl("@webwriter/cached", "1.0.0", "./dist/cached-widget.css")],
      members: [{
        ...demoPackage.members[0],
        id: "@webwriter/cached@1.0.0:./widgets/widget",
        packageName: "@webwriter/cached",
        packageVersion: "1.0.0",
        exportName: "./widgets/cached-widget.*",
        tagName: "cached-widget",
        scriptUrl: packageCdnUrl("@webwriter/cached", "1.0.0", "./dist/cached-widget.js"),
        styleUrl: packageCdnUrl("@webwriter/cached", "1.0.0", "./dist/cached-widget.css"),
      }],
      manifest: {
        name: "@webwriter/cached",
        version: "1.0.0",
        exports: {"./widgets/cached-widget.*": "./dist/cached-widget.*"},
      },
    }
    const append = vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()
    let settled = false
    const pending = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      importMap: {},
      widgets: [{name: cachedPackage.name, version: cachedPackage.version}],
      packages: [cachedPackage],
    }).then(() => { settled = true })

    await vi.waitFor(() => expect(append).toHaveBeenCalled())
    const assets = append.mock.calls.flat().filter((asset): asset is HTMLElement => asset instanceof HTMLElement)
    const style = assets.find(asset => asset instanceof HTMLLinkElement)!
    const script = assets.find(asset => asset instanceof HTMLScriptElement)!
    style.dispatchEvent(new Event("error"))
    await Promise.resolve()
    expect(settled).toBe(false)
    script.dispatchEvent(new Event("load"))
    await expect(pending).resolves.toBeUndefined()
    editor.destroy()
  })

  it("settles a superseded asset barrier", async () => {
    vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()
    const first = editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      importMap: {},
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
      importMap: {},
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

  it("preserves loaded package assets as ordinary serialized resources", async () => {
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()
    document.body.innerHTML = "<webwriter-demo></webwriter-demo>"
    // Parsing the authored script keeps Happy DOM from trying to fetch its
    // external URL while still exercising its serialization path.
    document.head.insertAdjacentHTML("beforeend", `<script src="${demoPackage.scripts[0]}"></script>`)

    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      importMap: {},
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
    })

    const output = await editor.serializeHTML()
    const parsed = new DOMParser().parseFromString(output, "text/html")
    expect(parsed.head.querySelectorAll(`script[src="${demoPackage.scripts[0]}"]`)).toHaveLength(1)
    const serializedScript = parsed.head.querySelector(`script[src="${demoPackage.scripts[0]}"]`)! 
    expect(serializedScript.getAttribute("nonce")).toBeNull()
    expect(serializedScript.classList.contains("◆editor-only")).toBe(false)
    expect(parsed.head.querySelector(`link[href="${demoPackage.styles[0]}"]`)).not.toBeNull()
    expect(parsed.head.querySelectorAll(`script[src="${SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL}"]`)).toHaveLength(1)
    expect(parsed.head.querySelector("script")?.getAttribute("src")).toBe(SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL)
    expect(parsed.head.querySelector("script")?.hasAttribute("type")).toBe(false)
    editor.destroy()
  })

  it("serializes only assets of widgets in the current document, including templates", async () => {
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const unusedScript = "https://example.test/unused.js"
    const unusedStyle = "https://example.test/unused.css"
    const pkg: WebWriterPackage = {
      ...demoPackage,
      scripts: [...demoPackage.scripts, unusedScript],
      styles: [...demoPackage.styles, unusedStyle],
      members: [
        {...demoPackage.members[0], scriptUrl: demoPackage.scripts[0], styleUrl: demoPackage.styles[0]},
        {...demoPackage.members[1], scriptUrl: unusedScript, styleUrl: unusedStyle},
      ],
    }
    const editor = new DOMEditor()
    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      importMap: {},
      widgets: [{name: pkg.name, version: pkg.version}],
      packages: [pkg],
    })
    document.body.innerHTML = `<section><template><template><webwriter-demo></webwriter-demo></template></template></section>`
    document.head.insertAdjacentHTML("beforeend", `<script src="${unusedScript}"></script><link rel="stylesheet" href="${unusedStyle}"><script src="https://example.test/authored.js"></script>`)

    for(const output of [editor.toHTML(), await editor.serializeHTML()]) {
      const parsed = new DOMParser().parseFromString(output, "text/html")
      expect(parsed.querySelector(`script[src="${demoPackage.scripts[0]}"]`)).not.toBeNull()
      expect(parsed.querySelector(`link[href="${demoPackage.styles[0]}"]`)).not.toBeNull()
      expect(parsed.querySelector(`script[src="${unusedScript}"]`)).toBeNull()
      expect(parsed.querySelector(`link[href="${unusedStyle}"]`)).toBeNull()
      expect(parsed.querySelector('script[src="https://example.test/authored.js"]')).not.toBeNull()
    }
    expect(document.head.querySelector(`script[src="${unusedScript}"]`)).not.toBeNull()
    // Direct DOM edits must affect the next save without reloading packages.
    document.body.innerHTML = "<webwriter-demo-item></webwriter-demo-item>"
    const changed = new DOMParser().parseFromString(await editor.serializeHTML(), "text/html")
    expect(changed.querySelector(`script[src="${unusedScript}"]`)).not.toBeNull()
    expect(changed.querySelector(`link[href="${unusedStyle}"]`)).not.toBeNull()
    expect(changed.querySelector(`script[src="${demoPackage.scripts[0]}"]`)).toBeNull()
    editor.destroy()
  })

  it("omits all widget assets and the polyfill from an empty offline export", async () => {
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()
    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      importMap: {},
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
    })
    document.head.insertAdjacentHTML("beforeend", `<script src="${demoPackage.scripts[0]}"></script><link rel="stylesheet" href="${demoPackage.styles[0]}"><script src="${SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL}"></script>`)
    const fetch = vi.spyOn(globalThis, "fetch")
    const parsed = new DOMParser().parseFromString(await editor.serializeHTML(true), "text/html")
    expect(parsed.querySelector("script, link[rel='stylesheet']")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
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
      importMap: {},
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
      importMap: {},
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
      importMap: {},
      widgets: [{name: localPackage.name, version: localPackage.version}],
      packages: [localPackage],
    })
    editor.destroy()
    await expect(pending).resolves.toBeUndefined()
  })

  it("rebuilds the schema from editingConfig without rewriting widget editing attributes", async () => {
    vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    vi.spyOn(document.head, "append").mockImplementation((...assets: (string | Node)[]) => {
      queueMicrotask(() => assets.forEach(asset => asset instanceof HTMLElement && asset.dispatchEvent(new Event("load"))))
    })
    const editor = new DOMEditor()
    document.body.innerHTML = '<webwriter-demo contenteditable="false"><webwriter-demo-item contenteditable="plaintext-only"><p>Nested text</p></webwriter-demo-item></webwriter-demo>'

    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      importMap: {},
      widgets: [{name: "@webwriter/demo", version: "1.2.3"}],
    })

    const widget = document.querySelector("webwriter-demo")!
    const item = document.querySelector("webwriter-demo-item")!
    expect(editor.schema.get("webwriter-demo")).toBeDefined()
    expect(editor.schema.get("webwriter-demo-item").inseperable).toBe(false)
    expect(editor.schema.isContentValid(widget)).toBe(true)
    expect(editor.schema.isContentValid(item)).toBe(true)
    expect(widget.getAttribute("contenteditable")).toBe("false")
    expect(item.getAttribute("contenteditable")).toBe("plaintext-only")

    const remoteItem = document.createElement("webwriter-demo-item")
    remoteItem.append(document.createElement("p"))
    widget.append(remoteItem)
    await new Promise<void>(resolve => setTimeout(resolve))
    // Only the editor's own marker is added; authored values stay unchanged.
    expect(remoteItem.getAttribute("contenteditable")).toBe("")
    expect(editor.toHTML(true)).toBe('<webwriter-demo contenteditable="false"><webwriter-demo-item contenteditable="plaintext-only"><p>Nested text</p></webwriter-demo-item><webwriter-demo-item><p></p></webwriter-demo-item></webwriter-demo>')

    await editor.getActionHandler(loadWidgetsMessage)({type: loadWidgetsMessage, widgets: []})
    expect(editor.schema.get("webwriter-demo")).toBeUndefined()
    expect(remoteItem.hasAttribute("contenteditable")).toBe(false)
    editor.destroy()
  })

  describe("package tests", () => {
    const start = (editor: DOMEditor, timeout?: number) => {
      const result = editor.features.dependency.runPackageTest("https://cdn.test/tests/basics.js", undefined, timeout)
      const frame = editor.appendix.querySelector("iframe")!
      const token = frame.srcdoc.match(/token: "([^"]+)"/)![1]
      const post = (detail: unknown) => window.dispatchEvent(new MessageEvent("message", {source: frame.contentWindow, data: {token, detail}}))
      return {result, frame, post}
    }

    it("collects test-update events until the run ends", async () => {
      const editor = new DOMEditor()
      const {result, frame, post} = start(editor)
      expect(frame.srcdoc).toContain('src="https://cdn.test/tests/basics.js"')
      post({type: "beforeAll"})
      post({type: "afterOne", id: "a", path: ["Suite", "passes"], passed: true, duration: 3})
      post({type: "afterOne", id: "b", path: ["Suite", "fails"], passed: false, timedOut: true})
      window.dispatchEvent(new MessageEvent("message", {source: window, data: {token: "forged", detail: {type: "afterAll"}}}))
      post({type: "afterAll"})
      await expect(result).resolves.toEqual({status: "failed", tests: [
        {id: "a", path: ["Suite", "passes"], passed: true, duration: 3},
        {id: "b", path: ["Suite", "fails"], passed: false, timedOut: true},
      ]})
      expect(frame.isConnected).toBe(false)
      editor.destroy()
    })

    it("reports load errors and timeouts", async () => {
      const editor = new DOMEditor()
      const failed = start(editor)
      failed.post({type: "error", message: "The test module failed to load"})
      await expect(failed.result).resolves.toEqual({status: "error", tests: [], error: "The test module failed to load"})
      vi.useFakeTimers()
      const slow = start(editor, 100)
      vi.advanceTimersByTime(100)
      await expect(slow.result).resolves.toEqual({status: "timeout", tests: []})
      vi.useRealTimers()
      expect(() => editor.features.dependency.runPackageTest("javascript:alert(1)")).toThrow("HTTP")
      editor.destroy()
    })
  })
})
