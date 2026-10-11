// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {editorFrameHTML, previewFrameHTML, type EditorFrameOptions, type PreviewFrameOptions} from "./frame-document"
import {defaultDocumentTheme, documentTheme} from "./document-themes"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "./local-package-worker"
import {packageImportMapId} from "./package-dependencies"
import {originalURLAttribute} from "./serialization"
import type {WebWriterPackage} from "./packages"

const hostOrigin = "https://app.example"
const frameOrigin = "https://editor.example"
const editorOptions = (changes: Partial<EditorFrameOptions> = {}): EditorFrameOptions => ({
  bridgeNonce: "host-bridge-nonce", revision: 3, language: "en", packages: [], hostOrigin,
  entryURL: "https://editor.example/assets/editor-entry.js", executeScripts: true, ...changes,
})
const previewOptions = (changes: Partial<PreviewFrameOptions> = {}): PreviewFrameOptions => ({
  bridgeNonce: "host-bridge-nonce", packages: [], importMap: null, hostOrigin, frameOrigin,
  entryURL: "https://editor.example/assets/preview-entry.js", executeScripts: true, ...changes,
})
const parse = (source: string) => new DOMParser().parseFromString(source, "text/html")

describe("isolated frame documents", () => {
  it("builds a fresh editing document using the supplied language and frame revision", () => {
    const source = editorFrameHTML(null, editorOptions({language: 'en\" data-untrusted="yes'}))
    const root = parse(source)
    expect(source.startsWith("<!-- frame 3 -->")).toBe(true)
    expect(root.documentElement.lang).toBe('en\" data-untrusted="yes')
    expect(root.documentElement.hasAttribute("data-untrusted")).toBe(false)
    expect(root.head.querySelector("style[data-ww-theme]")?.textContent).toBe(defaultDocumentTheme.source)
    expect(root.head.querySelector('meta[name="webwriter-editor-bridge"]')?.getAttribute("data-host-origin")).toBe(hostOrigin)
    expect(root.head.querySelector('script[type="module"]')?.getAttribute("src")).toBe(editorOptions().entryURL)
    expect(root.body.childNodes).toHaveLength(0)
  })

  it("preserves authored content, refresh metadata and themes while restoring offline URLs", () => {
    const theme = documentTheme("water")!
    const authored = parse(`<!DOCTYPE HTML PUBLIC "authored" "authored.dtd"><html data-authored="keep"><head><meta http-equiv="refresh" content="1;url=https://example.com"><style data-ww-theme="water">${theme.source}</style><script id="webwriter-package-importmap" type="importmap">{}</script></head><body><unfamiliar-node><!--keep--><template><img src="data:offline" ${originalURLAttribute("src")}="./original.png"></template><svg xmlns="http://www.w3.org/2000/svg"><g data-authored="yes"></g></svg></unfamiliar-node></body></html>`)
    const map = authored.querySelector('script[type="importmap"]')!
    map.id = packageImportMapId
    const source = editorFrameHTML(`<!DOCTYPE HTML PUBLIC "authored" "authored.dtd">${authored.documentElement.outerHTML}`, editorOptions())
    const root = parse(source)
    expect(root.doctype?.publicId).toBe("authored")
    expect(root.doctype?.systemId).toBe("authored.dtd")
    expect(root.documentElement.getAttribute("data-authored")).toBe("keep")
    expect(root.head.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content")).toBe("1;url=https://example.com")
    expect(root.head.querySelectorAll("style[data-ww-theme]")).toHaveLength(1)
    expect(root.getElementById(packageImportMapId)).toBeNull()
    expect(root.head.querySelector("style[data-ww-theme]")?.textContent).toBe(theme.source)
    expect(root.querySelector("unfamiliar-node")?.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    expect(root.querySelector("svg g")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
    const image = root.querySelector("template")!.content.querySelector("img")!
    expect(image.getAttribute("src")).toBe("./original.png")
    expect(image.hasAttribute(originalURLAttribute("src"))).toBe(false)
  })

  it("cleans a preview copy and installs only the trusted runtime with a separate script nonce", () => {
    const source = parse('<html><head><script>authored()</script><style>.authored {color: red}</style></head><body><p class="authored ◆selected" contenteditable="">text</p><demo-widget class="◆widget-editable" contenteditable=""></demo-widget><aside class="◆editor-only">UI</aside><template><i data-webwriter-editor-only>UI</i><b class="◆caret authored">nested</b></template></body></html>')
    const root = parse(previewFrameHTML(source, previewOptions()))
    expect(root.querySelector("aside")).toBeNull()
    expect(root.querySelector("p")?.outerHTML).toBe('<p class="authored" contenteditable="">text</p>')
    expect(root.querySelector("demo-widget")?.hasAttribute("contenteditable")).toBe(false)
    expect(root.querySelector("template")?.innerHTML).toBe('<b class="authored">nested</b>')
    expect(root.querySelector("style")?.textContent).toBe(".authored {color: red}")
    expect(Array.from(root.querySelectorAll("script")).some(script => script.textContent === "authored()")).toBe(false)
    const bridge = root.querySelector('meta[name="webwriter-preview-bridge"]')!
    expect(bridge.getAttribute("data-nonce")).toBe("host-bridge-nonce")
    const scripts = Array.from(root.querySelectorAll("script"))
    expect(scripts.some(script => script.getAttribute("src") === previewOptions().entryURL)).toBe(true)
    const nonce = scripts[0].getAttribute("nonce")!
    expect(nonce).not.toBe("host-bridge-nonce")
    expect(scripts.every(script => script.getAttribute("nonce") === nonce)).toBe(true)
    expect(root.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toContain(`'nonce-${nonce}'`)
  })

  it("rewrites only local package URLs and leaves the package metadata untouched", () => {
    const script = `${hostOrigin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/widget.js`
    const pkg: WebWriterPackage = {name: "fixture", version: "1", label: "Fixture", authors: [], keywords: [], links: {},
      scripts: [script], styles: [], members: [{id: "widget", packageName: "fixture", packageVersion: "1", exportName: "./widget", kind: "widget", label: "Widget", insertable: true, tagName: "demo-widget", scriptUrl: script}]}
    const source = parse(`<html><head></head><body><demo-widget></demo-widget><img src="${hostOrigin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/image.png"><img src="${hostOrigin}/authored.png"></body></html>`)
    const root = parse(previewFrameHTML(source, previewOptions({packages: [pkg]})))
    expect(root.querySelector('script[src*="widget.js"]')?.getAttribute("src")).toBe(script.replace(hostOrigin, frameOrigin))
    expect(root.querySelectorAll("img")[0].getAttribute("src")).toBe(`${frameOrigin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/image.png`)
    expect(root.querySelectorAll("img")[1].getAttribute("src")).toBe(`${hostOrigin}/authored.png`)
    expect(pkg.scripts).toEqual([script])
    expect(pkg.members[0].scriptUrl).toBe(script)
  })

  it("retains slide fragment navigation and supports inert test frames", () => {
    const source = parse('<html><head></head><body class="ww-slides"><nav class="ww-slides-navigation"><a href="#next">next</a></nav></body></html>')
    const root = parse(previewFrameHTML(source, previewOptions({executeScripts: false})))
    expect(root.querySelector("a")?.getAttribute("href")).toBe("about:srcdoc#next")
    expect(root.querySelector('meta[name="webwriter-preview-bridge"]')).toBeNull()
    expect(root.querySelector('script[src*="preview-entry"]')).toBeNull()
    const editor = parse(editorFrameHTML(null, editorOptions({executeScripts: false})))
    expect(Array.from(editor.querySelectorAll("script[src]")).every(script => script.getAttribute("type") === "application/json")).toBe(true)
  })
})
