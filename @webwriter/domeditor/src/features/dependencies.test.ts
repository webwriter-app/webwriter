// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {loadWidgetsMessage} from "../editor-bridge"
import {WebWriterPackageRegistry, type WebWriterPackage} from "../packages"

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
  it("creates pinned CDN styles and scripts for bridged widgets", async () => {
    const getPackage = vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    const append = vi.spyOn(document.head, "append").mockImplementation(() => {})
    const editor = new DOMEditor()

    await editor.getActionHandler(loadWidgetsMessage)({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.2.3"}],
    })

    expect(getPackage).toHaveBeenCalledWith({name: "@webwriter/demo", version: "1.2.3"})
    const assets = append.mock.calls.flat()
    expect(assets.find((asset): asset is HTMLLinkElement => asset instanceof HTMLLinkElement)?.href)
      .toBe("https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.css")
    expect(assets.find((asset): asset is HTMLScriptElement => asset instanceof HTMLScriptElement)?.src)
      .toBe("https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.js")
    expect(globalThis.DOMEDITOR_PACKAGE_ITEMS).toEqual([
      expect.objectContaining({name: "Demo Widget", tag: "webwriter-demo"}),
    ])
    editor.destroy()
  })

  it("rebuilds the schema from editingConfig and makes nested widget content editable", async () => {
    vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    vi.spyOn(document.head, "append").mockImplementation(() => {})
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
