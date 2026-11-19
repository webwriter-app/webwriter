// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {WebsiteSandbox, localWebsiteHTML, prepareWebsiteFrames} from "./website-sandbox"
import {clearWebsiteDocument, isAuthoredMutation, ownsWebsiteDocument, registerFrameArtifacts, setWebsiteDocument} from "./editor-artifacts"
import {cloneInert} from "./utility"
import {SharedDOMDoc} from "./domdoc"

const controllers: WebsiteSandbox[] = []
const documents: SharedDOMDoc[] = []
const data = (html: string) => `data:text/html,${encodeURIComponent(html)}`
const root = () => document.implementation.createHTMLDocument().body
const mount = (body: HTMLElement, source: string) => {
  const frame = body.ownerDocument.createElement("iframe")
  frame.src = source
  body.append(frame)
  return frame
}
const controller = (body: HTMLElement, read = vi.fn(async () => new Blob(["<p>Local</p>"], {type: "text/html"}))) => {
  const sandbox = new WebsiteSandbox(body, read)
  controllers.push(sandbox)
  return sandbox
}

afterEach(() => {
  controllers.splice(0).forEach(controller => controller.dispose())
  documents.splice(0).forEach(doc => doc.destroy())
})

describe("Website runtime resources", () => {
  it("retains original URLs and excludes runtime documents from clones and collaboration", () => {
    const body = root(), source = data("<!--keep--><p>Original</p>")
    const frame = mount(body, source)
    const shared = new SharedDOMDoc(undefined, undefined, [], [], {root: body})
    documents.push(shared)
    const sandbox = controller(body)
    sandbox.refresh()
    expect(ownsWebsiteDocument(frame)).toBe(true)
    expect(frame.src).toBe(source)
    expect(cloneInert(body, true).querySelector("iframe")!.hasAttribute("srcdoc")).toBe(false)
    shared.syncFromDOM()
    const mirrored = shared.body.get(0) as Y.XmlElement
    expect(mirrored.getAttribute("src")).toBe(source)
    expect(mirrored.getAttribute("srcdoc")).toBeUndefined()
    expect(shared.canUndo).toBe(false)
    sandbox.dispose()
    expect(frame.hasAttribute("srcdoc")).toBe(false)
  })

  it("keeps remote changes authoritative and preserves an explicitly authored srcdoc", () => {
    const body = root(), frame = mount(body, data("<p>First</p>"))
    const shared = new SharedDOMDoc(undefined, undefined, [], [], {root: body})
    documents.push(shared)
    const sandbox = controller(body)
    sandbox.refresh()
    const mirrored = shared.body.get(0) as Y.XmlElement
    shared.doc.transact(() => mirrored.setAttribute("src", data("<p>Remote</p>")), "remote")
    sandbox.refresh()
    expect(frame.srcdoc).toContain("Remote")
    shared.doc.transact(() => mirrored.setAttribute("srcdoc", "<p>Authored override</p>"), "remote")
    sandbox.refresh()
    expect(frame.srcdoc).toBe("<p>Authored override</p>")
    expect(ownsWebsiteDocument(frame)).toBe(false)
    sandbox.dispose()
    expect(frame.srcdoc).toBe("<p>Authored override</p>")
  })

  it.each(["source", "removed", "authored", "disposed"])("ignores a completed Blob read after the frame is %s", async change => {
    const body = root(), frame = mount(body, "blob:https://example.test/local")
    let finish!: (blob: Blob) => void
    const read = vi.fn(() => new Promise<Blob>(resolve => { finish = resolve }))
    const sandbox = controller(body, read)
    sandbox.refresh()
    if(change === "source") frame.src = "https://example.com/new"
    if(change === "removed") frame.remove()
    if(change === "authored") frame.srcdoc = "<p>Author</p>"
    if(change === "disposed") sandbox.dispose()
    sandbox.refresh()
    finish(new Blob(["<p>Stale</p>"], {type: "text/html"}))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(frame.getAttribute("srcdoc")).toBe(change === "authored" ? "<p>Author</p>" : null)
  })

  it("leaves remote URLs and widget-owned light DOM alone", () => {
    const body = root(), frame = mount(body, "https://example.com/lesson")
    const sandbox = controller(body)
    sandbox.refresh()
    expect(frame.hasAttribute("srcdoc")).toBe(false)
    const opaque = new WebsiteSandbox(body, vi.fn(), () => false)
    controllers.push(opaque)
    frame.src = data("<p>Widget</p>")
    opaque.refresh()
    expect(frame.hasAttribute("srcdoc")).toBe(false)
  })

  it("preserves native static content when the author disallows scripts", () => {
    const body = root(), frame = mount(body, data("<p>Static content</p>"))
    frame.setAttribute("sandbox", "")
    const sandbox = controller(body)
    sandbox.refresh()
    prepareWebsiteFrames(body)
    expect(frame.hasAttribute("srcdoc")).toBe(false)
    frame.setAttribute("sandbox", "allow-scripts")
    sandbox.refresh()
    expect(ownsWebsiteDocument(frame)).toBe(true)
    frame.setAttribute("sandbox", "")
    sandbox.refresh()
    expect(frame.hasAttribute("srcdoc")).toBe(false)
  })

  it("observes source replacement in previews and stops on disposal", async () => {
    const body = document.createElement("main"), frame = mount(body, data("<p>First</p>"))
    const sandbox = controller(body)
    sandbox.observe()
    frame.src = data("<p>Second</p>")
    await vi.waitFor(() => expect(frame.srcdoc).toContain("Second"))
    sandbox.dispose()
    frame.src = data("<p>After disposal</p>")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(frame.hasAttribute("srcdoc")).toBe(false)
  })

  it("registers exported documents as resources before authored snapshots", () => {
    const body = root(), frame = mount(body, data("<p>Portable</p>"))
    prepareWebsiteFrames(body)
    registerFrameArtifacts(body.ownerDocument)
    expect(frame.hasAttribute("data-webwriter-original-srcdoc")).toBe(false)
    expect(ownsWebsiteDocument(frame)).toBe(true)
    expect(cloneInert(body, true).querySelector("iframe")!.hasAttribute("srcdoc")).toBe(false)
  })

  it("preserves unfamiliar namespaced attributes with the same local name", () => {
    const body = root(), frame = mount(body, data("<p>Original</p>"))
    frame.setAttributeNS("urn:authored", "a:srcdoc", "Author metadata")
    const sandbox = controller(body)
    sandbox.refresh()
    expect(ownsWebsiteDocument(frame)).toBe(true)
    const copied = cloneInert(body, true).querySelector("iframe")!
    expect(copied.getAttributeNS(null, "srcdoc")).toBeNull()
    expect(copied.getAttributeNS("urn:authored", "srcdoc")).toBe("Author metadata")
    sandbox.dispose()
    expect(frame.getAttributeNS("urn:authored", "srcdoc")).toBe("Author metadata")
  })

  it("filters setting and removing a runtime document while detecting authored replacements", () => {
    const body = root(), frame = mount(body, data("<p>Source</p>"))
    const observer = new MutationObserver(() => {})
    observer.observe(frame, {attributes: true, attributeOldValue: true})
    setWebsiteDocument(frame, "<p>Runtime</p>")
    expect(observer.takeRecords().some(isAuthoredMutation)).toBe(false)
    clearWebsiteDocument(frame)
    expect(observer.takeRecords().some(isAuthoredMutation)).toBe(false)
    setWebsiteDocument(frame, "<p>Runtime</p>")
    observer.takeRecords()
    frame.srcdoc = "<p>Author</p>"
    expect(observer.takeRecords().some(isAuthoredMutation)).toBe(true)
    observer.disconnect()
  })

  it("fails safely on malformed or non-HTML data sources", () => {
    expect(localWebsiteHTML("data:text/html;base64,%%%invalid")).toBeNull()
    expect(localWebsiteHTML("data:text/plain,not-html")).toBeNull()
    expect(localWebsiteHTML("https://example.com/page.html")).toBeNull()
  })

  it("decodes UTF-8 and explicit legacy encodings without treating URL fragments as HTML", () => {
    expect(localWebsiteHTML("data:text/html;charset=windows-1252,%3Cp%3EGr%FC%DFe%3C/p%3E#heading")).toBe("<p>Grüße</p>")
    expect(localWebsiteHTML(data("<p>Grüße 🌍</p>"))).toBe("<p>Grüße 🌍</p>")
  })

  it("leaves custom-element internals opaque when preparing portable resources", () => {
    const body = root()
    body.innerHTML = '<custom-lesson><iframe></iframe><template><iframe></iframe></template></custom-lesson><iframe is="custom-website"></iframe>'
    body.querySelectorAll("iframe").forEach(frame => { frame.src = data("<p>Opaque</p>") })
    body.querySelector("template")!.content.querySelector("iframe")!.src = data("<p>Opaque</p>")
    const before = body.innerHTML
    prepareWebsiteFrames(body)
    expect(body.innerHTML).toBe(before)
  })
})
