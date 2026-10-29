// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {bundleLocalPreviewPackages, editorFrameHTML, previewFrameHTML, type EditorFrameOptions, type PreviewFrameOptions} from "./frame-document"
import * as offlineBundler from "./offline-module-bundler"
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

describe("local live preview bundles", () => {
  it("preserves the validated YouTube sandbox policy through repeated preview preparation", () => {
    let source = parse('<iframe src="https://www.youtube.com/embed/aPweFhhXFvY" sandbox="allow-scripts" srcdoc="<script>bad()</script>"></iframe><iframe src="https://example.com/embed"></iframe>')
    for(let pass = 0; pass < 2; pass++) {
      const preview = parse(previewFrameHTML(source, previewOptions()))
      const frames = preview.querySelectorAll("iframe")
      expect(frames[0].getAttribute("sandbox")).toBe("allow-scripts allow-same-origin")
      expect(frames[0].hasAttribute("srcdoc")).toBe(false)
      expect(frames[1].getAttribute("sandbox")).toBe("allow-scripts")
      source = preview
    }
  })

  it("allows Bunny Fonts stylesheets in an editing frame without installed widgets", () => {
    const source = editorFrameHTML('<p style="font-family: Alegreya, serif">Text</p>', editorOptions({bridgeNonce: "font-test"}))
    const policy = parse(source).head.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!
    expect(policy).toContain("style-src-elem 'nonce-font-test' https://fonts.bunny.net data:;")
  })
  afterEach(() => vi.restoreAllMocks())
  const script = `${hostOrigin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/widget.js?revision=2`
  const style = `${hostOrigin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/widget.css?revision=2`
  const unused = `${hostOrigin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/unused.js`
  const pkg: WebWriterPackage = {name: "fixture", version: "1", label: "Fixture", authors: [], keywords: [], links: {},
    scripts: [script, unused], styles: [style], members: [
      {id: "widget", packageName: "fixture", packageVersion: "1", exportName: "./widget", kind: "widget", label: "Widget", insertable: true, tagName: "demo-widget", scriptUrl: script, styleUrl: style},
      {id: "unused", packageName: "fixture", packageVersion: "1", exportName: "./unused", kind: "widget", label: "Unused", insertable: true, tagName: "unused-widget", scriptUrl: unused},
    ]}

  it("embeds only required local entries and reinstalls them after learner sanitization", async () => {
    const bundle = vi.spyOn(offlineBundler, "bundleOfflineModules").mockResolvedValue({js: 'customElements.define("demo-widget", class extends HTMLElement {})', css: "demo-widget {color: red}"})
    const body = '<section><!--keep--><demo-widget><script type="application/json">{"value":1}</script></demo-widget><template><demo-widget></demo-widget></template></section>'
    const authored = parse(body)
    const source = parse(previewFrameHTML(authored.cloneNode(true) as Document, previewOptions({packages: [pkg]})))
    const map = {imports: {helper: "https://cdn.example/helper.js"}}
    const dependencies = await bundleLocalPreviewPackages(source, [pkg], map, hostOrigin)
    expect(bundle).toHaveBeenCalledExactlyOnceWith([script, style], map, hostOrigin)
    const portable = dependencies.packages[0]
    expect(portable.scripts).toHaveLength(1)
    expect(portable.scripts[0]).toMatch(/^data:text\/javascript/)
    expect(portable.styles[0]).toMatch(/^data:text\/css/)
    expect(portable.members[0].scriptUrl).toBe(portable.scripts[0])
    expect(portable.members[1].scriptUrl).toBeUndefined()
    const shared = previewFrameHTML(source, previewOptions(dependencies))
    const learner = parse(previewFrameHTML(parse(shared), previewOptions({...dependencies, standalone: true})))
    expect([...learner.querySelectorAll<HTMLScriptElement>("script[src]")].map(script => script.getAttribute("src"))).toEqual(portable.scripts)
    expect([...learner.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => link.getAttribute("href"))).toEqual(portable.styles)
    expect(learner.body.innerHTML).toBe(body)
    expect(authored.body.innerHTML).toBe(body)
    expect(pkg.scripts).toEqual([script, unused])
    expect(pkg.styles).toEqual([style])
    expect(learner.head.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1)
    const nonce = learner.head.querySelector("script[src]")!.getAttribute("nonce")
    expect(learner.head.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")).toContain(`'nonce-${nonce}'`)
  })

  it("keeps published resources and skips unused local widgets", async () => {
    const bundle = vi.spyOn(offlineBundler, "bundleOfflineModules")
    const remote = {...pkg, scripts: ["https://cdn.example/widget.js"], styles: [], members: [{...pkg.members[0], scriptUrl: "https://cdn.example/widget.js", styleUrl: undefined}]}
    const dependencies = await bundleLocalPreviewPackages(parse("<p>No widgets</p>"), [pkg, remote], null, hostOrigin)
    expect(dependencies).toEqual({packages: [pkg, remote], importMap: null})
    expect(bundle).not.toHaveBeenCalled()
  })

  it("includes CSS emitted by widget imports even without a declared stylesheet", async () => {
    vi.spyOn(offlineBundler, "bundleOfflineModules").mockResolvedValue({js: "register()", css: "demo-widget {display: block}"})
    const dependencies = await bundleLocalPreviewPackages(parse("<demo-widget></demo-widget>"), [{...pkg, styles: [], members: [{...pkg.members[0], styleUrl: undefined}]}], null, hostOrigin)
    expect(dependencies.packages[0].styles[0]).toMatch(/^data:text\/css/)
  })

  it("shares one source for all package and member references to the bundled graph", async () => {
    const js = 'customElements.define("demo-widget", class extends HTMLElement {})'
    vi.spyOn(offlineBundler, "bundleOfflineModules").mockResolvedValue({js, css: undefined})
    const second = {...pkg, name: "second", members: [{...pkg.members[0], tagName: "other-widget"}]}
    const dependencies = await bundleLocalPreviewPackages(parse("<demo-widget></demo-widget><other-widget></other-widget>"), [pkg, second], null, hostOrigin)
    const serialized = previewFrameHTML(parse("<demo-widget></demo-widget><other-widget></other-widget>"), previewOptions({...dependencies, standalone: true, entryURL: ""}))
    expect(serialized.split(encodeURIComponent(js))).toHaveLength(2)
    expect(dependencies.packages[0].scripts).toEqual(dependencies.packages[1].scripts)
    expect(dependencies.packages[0].members[0].scriptUrl).toBe(dependencies.packages[1].members[0].scriptUrl)
  })

  it("fails before changing the preview when a local source cannot be bundled", async () => {
    vi.spyOn(offlineBundler, "bundleOfflineModules").mockRejectedValue(new Error("Local source unavailable"))
    const source = parse(`<link rel="stylesheet" href="${style}"><demo-widget></demo-widget>`)
    const html = source.documentElement.outerHTML
    await expect(bundleLocalPreviewPackages(source, [pkg], null, hostOrigin)).rejects.toThrow("Local source unavailable")
    expect(source.documentElement.outerHTML).toBe(html)
  })
})

describe("isolated frame documents", () => {
  it.each([null, '<iframe src="data:text/html,%3Cp%3ELocal%3C/p%3E" sandbox="allow-scripts"></iframe>'])("allows uploaded and saved local websites in editing frames", html => {
    const root = parse(editorFrameHTML(html, editorOptions()))
    const policy = root.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')!.content
    expect(policy).toContain("frame-src https: blob: data:")
    expect(policy).toContain("object-src 'none'")
  })

  it.each(["blob:https://editor.example/local", "data:text/html;base64,PHA+TG9jYWw8L3A+"])("preserves local websites through repeated preview preparation: %s", src => {
    let source = parse(`<section><!--keep--><iframe title="Local" src="${src}" sandbox="allow-scripts allow-same-origin"></iframe></section>`)
    for(let pass = 0; pass < 2; pass++) {
      source = parse(previewFrameHTML(source, previewOptions()))
      expect(source.querySelector("iframe")?.getAttribute("src")).toBe(src)
      expect(source.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts")
      expect(source.querySelector("section")?.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
      expect(source.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')!.content).toContain("frame-src https: blob: data:;")
    }
  })

  it("defers authored module URLs until before the trusted editor initializes", () => {
    const source = '<html><head><script type="module" class="authored" src="https://cdn.example/widget.js"></script><script src="./classic.js"></script></head><body><script type="module" src="./body.js"></script><template><script type="module" src="./inert.js"></script></template></body></html>'
    const root = parse(editorFrameHTML(source, editorOptions()))
    const pending = [...root.querySelectorAll<HTMLScriptElement>("script.◆pending-module")]
    expect(pending).toHaveLength(2)
    expect(pending.every(script => !script.hasAttribute("src"))).toBe(true)
    const restore = root.head.querySelector<HTMLScriptElement>('script.◆editor-only[type="module"]:not([src])')!
    expect(restore.getAttribute("nonce")).toBe("host-bridge-nonce")
    expect(restore.textContent).toContain('[["https://cdn.example/widget.js","authored"],["./body.js",null]]')
    expect(restore.compareDocumentPosition(root.head.querySelector('script[src*="editor-entry"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(root.querySelector('script[src="./classic.js"]')).not.toBeNull()
    expect(root.querySelector("template")!.content.querySelector('script[src="./inert.js"]')).not.toBeNull()
    const inert = parse(editorFrameHTML(source, editorOptions({executeScripts: false})))
    expect(inert.querySelector(".◆pending-module")).toBeNull()
    expect(inert.querySelector('script[src="https://cdn.example/widget.js"]')).not.toBeNull()
  })

  it("allows the package test shell under the configured application base path", () => {
    vi.stubEnv("BASE_URL", "/nested/")
    try {
      const root = parse(editorFrameHTML(null, editorOptions({entryURL: "http://localhost:5173/nested/assets/editor-entry.js"})))
      const policy = root.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')!.content
      expect(policy).toContain("frame-src https: blob: data: http://localhost:5173/nested/frame-shell.html;")
      expect(policy).not.toContain("frame-src https: http:;")
    }
    finally { vi.unstubAllEnvs() }
  })

  it("permits the trusted module worker origin without allowing arbitrary HTTP workers", () => {
    const root = parse(editorFrameHTML(null, editorOptions({entryURL: "http://localhost:5173/src/editor-entry.ts"})))
    const policy = root.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')!.content
    expect(policy).toContain("worker-src blob: https: http://localhost:5173;")
    expect(policy).toContain("script-src 'nonce-host-bridge-nonce' 'strict-dynamic' 'wasm-unsafe-eval';")
    expect(policy).not.toContain("worker-src blob: https: http:;")
  })

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

  it("replaces the adapter from a saved export with one nonce-bearing bootstrap", () => {
    const script = "https://cdn.example/widget.js"
    const source = '<html><head><script id="webwriter-scoped-registry">oldAdapter()</script></head><body><demo-widget></demo-widget></body></html>'
    const root = parse(editorFrameHTML(source, editorOptions({packages: [{
      name: "fixture", version: "1", label: "Fixture", authors: [], keywords: [], links: {}, scripts: [script], styles: [], members: [],
    }]})))
    const adapters = root.querySelectorAll<HTMLScriptElement>("#webwriter-scoped-registry")
    expect(adapters).toHaveLength(1)
    expect(adapters[0].textContent).not.toBe("oldAdapter()")
    expect(adapters[0].getAttribute("nonce")).toBe("host-bridge-nonce")
    expect(root.head.querySelector('script[type="module"]')?.getAttribute("src")).toBe(editorOptions().entryURL)
    expect(adapters[0].compareDocumentPosition(root.head.querySelector('script[type="module"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
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

  it("retains object URLs in preview media and permits them in its policy", () => {
    const url = "blob:https://editor.example/media-id"
    const source = parse(`<html><head></head><body><img src="${url}"><audio src="${url}"></audio><video><source src="${url}"></video></body></html>`)
    const root = parse(previewFrameHTML(source, previewOptions()))
    for(const element of root.querySelectorAll("img, audio, source")) expect(element.getAttribute("src")).toBe(url)
    const policy = root.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')!.content
    expect(policy).toContain("img-src * data: blob:")
    expect(policy).toContain("media-src * data: blob:")
  })

  it("prepares a standalone learner document without the iframe bridge", () => {
    const root = parse(previewFrameHTML(parse('<article><!--keep--><demo-widget></demo-widget></article>'), previewOptions({standalone: true})))
    expect(root.querySelector('meta[name="webwriter-preview-bridge"], script[src*="preview-entry"], dom-editor, iframe')).toBeNull()
    expect(root.body.innerHTML).toBe('<article><!--keep--><demo-widget></demo-widget></article>')
    expect(root.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull()
    expect(root.querySelector("base")!.getAttribute("href")).toBe(`${frameOrigin}/`)
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

  it("replaces the host preview policy when preparing a learner preview with fresh script nonces", () => {
    const script = "https://cdn.example/widget.js"
    const options = previewOptions({packages: [{
      name: "fixture", version: "1", label: "Fixture", authors: [], keywords: [], links: {}, scripts: [script], styles: [],
      members: [{id: "widget", packageName: "fixture", packageVersion: "1", exportName: "./widget", kind: "widget", label: "Widget", insertable: true, tagName: "demo-widget", scriptUrl: script}],
    }], importMap: {imports: {lit: "https://cdn.example/lit.js"}}})
    const host = parse(previewFrameHTML(parse('<demo-widget><script type="application/json">{"answer":1}</script></demo-widget>'), options))
    const oldNonce = host.querySelector("script[nonce]")!.getAttribute("nonce")
    const learner = parse(previewFrameHTML(host, {...options, bridgeNonce: "learner-bridge-nonce"}))
    const policies = learner.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
    expect(policies).toHaveLength(1)
    const nonce = learner.querySelector("script[nonce]")!.getAttribute("nonce")!
    expect(nonce).not.toBe(oldNonce)
    expect(policies[0].getAttribute("content")).toContain(`'nonce-${nonce}'`)
    expect(Array.from(learner.head.querySelectorAll("script")).every(script => script.getAttribute("nonce") === nonce)).toBe(true)
    expect(learner.querySelector('script[src="https://cdn.example/widget.js"]')).not.toBeNull()
    expect(JSON.parse(learner.getElementById(packageImportMapId)!.textContent!)).toEqual(options.importMap)
    expect(learner.querySelector('meta[name="webwriter-preview-bridge"]')!.getAttribute("data-nonce")).toBe("learner-bridge-nonce")
    expect(learner.querySelector("demo-widget script")!.textContent).toBe('{"answer":1}')
  })

  it("retains slide fragment navigation and supports inert test frames", () => {
    const source = parse('<html><head></head><body class="ww-slides"><div class="ww-slides-viewport"><section class="ww-slide" id="next"><nav class="ww-slide-directions"><a href="#previous">previous</a></nav></section></div><nav class="ww-slides-navigation"><a href="#next">next</a></nav></body></html>')
    const root = parse(previewFrameHTML(source, previewOptions({executeScripts: false})))
    expect([...root.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(["#previous", "#next"])
    const active = parse(previewFrameHTML(source, previewOptions()))
    expect([...active.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(["#previous", "#next"])
    expect(root.querySelector('meta[name="webwriter-preview-bridge"]')).toBeNull()
    expect(root.querySelector('script[src*="preview-entry"]')).toBeNull()
    const editor = parse(editorFrameHTML(null, editorOptions({executeScripts: false})))
    expect(Array.from(editor.querySelectorAll("script[src]")).every(script => script.getAttribute("type") === "application/json")).toBe(true)
  })
})


it("installs the hotspot popover runtime under the preview script nonce", () => {
  const source = parse('<img usemap="#plan"><map name="plan"><area href="#details" interestfor="details"></map><div id="details" popover="auto"><p>Content</p></div>')
  const root = parse(previewFrameHTML(source, previewOptions()))
  const script = root.querySelector<HTMLScriptElement>("#webwriter-image-map-popovers")!
  expect(script).not.toBeNull()
  expect(script.getAttribute("nonce")).toBeTruthy()
  expect(root.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")).toContain(`'nonce-${script.getAttribute("nonce")}'`)
  expect(root.querySelector("area")!.getAttribute("interestfor")).toBe("details")
  expect(root.querySelector("#details p")!.textContent).toBe("Content")
})
