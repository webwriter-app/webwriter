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
  members: [{
    id: "@webwriter/demo@1.2.3:./widgets/webwriter-demo",
    packageName: "@webwriter/demo",
    packageVersion: "1.2.3",
    exportName: "./widgets/webwriter-demo.*",
    kind: "widget",
    label: "Demo Widget",
    insertable: true,
    tagName: "webwriter-demo",
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
})
