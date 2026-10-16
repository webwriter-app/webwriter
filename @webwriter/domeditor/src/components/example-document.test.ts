// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"

const {getPackage, resolveDependencies} = vi.hoisted(() => ({getPackage: vi.fn(), resolveDependencies: vi.fn()}))
vi.mock("../packages", async importOriginal => ({
  ...await importOriginal<typeof import("../packages")>(),
  WebWriterPackageRegistry: class {getPackage = getPackage},
}))
vi.mock("../package-dependencies", async importOriginal => ({
  ...await importOriginal<typeof import("../package-dependencies")>(),
  resolvePackageDependencies: resolveDependencies,
}))
import {ExampleDocumentView} from "./example-document"
import {setLanguage} from "../site-language"

let view: ExampleDocumentView
beforeEach(() => {
  vi.clearAllMocks()
  getPackage.mockImplementation(async ({name, version}: {name: string, version: string}): Promise<WebWriterPackage> => {
    const tagName = name === "@webwriter/code" ? "webwriter-code-javascript" : "webwriter-quiz"
    const scriptUrl = `https://cdn.jsdelivr.net/npm/${name}@${version}/widget.js`
    return {name, version, label: name, authors: [], keywords: [], links: {}, scripts: [scriptUrl], styles: [],
      members: [{id: tagName, packageName: name, packageVersion: version, exportName: `./widgets/${tagName}.js`, kind: "widget", tagName, label: tagName, scriptUrl, insertable: true}]}
  })
  resolveDependencies.mockResolvedValue({entries: [], map: null})
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:example")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
})
afterEach(() => {view?.remove(); setLanguage("en", false); vi.restoreAllMocks()})
async function mount() {
  view = new ExampleDocumentView()
  view.exampleId = "binary"
  document.body.append(view)
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector("iframe")).not.toBeNull())
  return view.shadowRoot!.querySelector("iframe")!
}
function message(frame: HTMLIFrameElement, origin: string, nonce: string) {
  window.dispatchEvent(new MessageEvent("message", {origin, source: frame.contentWindow, data: {
    type: "webwriter-frame-shell-ready", kind: "preview", revision: new URL(frame.src).searchParams.get("revision"), bridgeNonce: nonce,
  }}))
}

it("uses an authenticated isolated learner frame and produces an editable standalone download", async () => {
  const frame = await mount()
  const url = new URL(frame.src)
  const nonce = new URLSearchParams(url.hash.slice(1)).get("nonce")!
  expect(url.origin).not.toBe(location.origin)
  expect(frame.sandbox.contains("allow-scripts")).toBe(true)
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  message(frame, location.origin, nonce)
  message(frame, url.origin, "wrong nonce")
  expect(post).not.toHaveBeenCalled()
  message(frame, url.origin, nonce)
  expect(post).toHaveBeenCalledOnce()
  const html = post.mock.calls[0][0].html
  expect(html).toContain("<webwriter-code-javascript")
  expect(html).toContain("Count like a computer")
  expect(html).not.toContain("src/editor-entry")
  expect(view.shadowRoot?.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("/editor/?example=binary&lang=en")
  expect(view.shadowRoot?.textContent).toContain("Edit in WebWriter")
  expect(view.shadowRoot?.textContent).not.toMatch(/Reset example|Learner view/)
  expect(view.shadowRoot?.querySelector("a[download]")?.getAttribute("download")).toBe("binary.html")
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
  const saved = await blob.text()
  expect(saved).toContain('data-ww-theme="base"')
  expect(saved).toContain('id="webwriter-scoped-registry"')
  expect(saved).not.toContain("webwriter-preview-bridge")
  expect(saved).not.toContain("◆editor-only")
  const download = view.shadowRoot!.querySelector<HTMLAnchorElement>("a[download]")!
  const click = vi.spyOn(download, "click").mockImplementation(() => {})
  window.dispatchEvent(new MessageEvent("message", {origin: url.origin, source: frame.contentWindow, data: {type: "preview-frame-save", bridgeNonce: nonce}}))
  expect(click).toHaveBeenCalledOnce()
  view.remove()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:example")
})

it("replaces the frame when the example changes and discards an obsolete frame's bridge", async () => {
  const first = await mount()
  const firstURL = new URL(first.src)
  view.exampleId = "printing"
  await vi.waitFor(() => {
    const frame = view.shadowRoot?.querySelector("iframe")
    expect(frame).not.toBeNull()
    expect(frame?.src).not.toBe(firstURL.href)
  })
  const second = view.shadowRoot!.querySelector("iframe")!
  expect(second).not.toBeNull()
  const post = vi.spyOn(second.contentWindow!, "postMessage")
  message(first, firstURL.origin, new URLSearchParams(firstURL.hash.slice(1)).get("nonce")!)
  expect(post).not.toHaveBeenCalled()
})

it("rebuilds the isolated example and editable download in the selected language", async () => {
  const first = await mount()
  setLanguage("de", false)
  await vi.waitFor(() => {
    const frame = view.shadowRoot?.querySelector("iframe")
    expect(frame).not.toBeNull()
    expect(frame?.src).not.toBe(first.src)
  })
  const frame = view.shadowRoot!.querySelector("iframe")!
  const url = new URL(frame.src)
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  message(frame, url.origin, new URLSearchParams(url.hash.slice(1)).get("nonce")!)
  const source = post.mock.calls[0][0].html as string
  expect(source).toContain('lang="de"')
  expect(new DOMParser().parseFromString(source, "text/html").querySelector("h1")?.textContent).toBe("Zählen wie ein Computer")
  expect(view.shadowRoot!.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe("/editor/?example=binary&lang=de")
  expect(view.shadowRoot!.querySelector("h2")?.textContent).toBe("Zählen wie ein Computer")
})

it("requests dismissal with an accessible icon button", async () => {
  await mount()
  const close = vi.fn()
  view.addEventListener("close-example", close)
  const button = view.shadowRoot!.querySelector('button[aria-label="Close example"]')!
  expect(button.querySelector("svg")).not.toBeNull()
  button.dispatchEvent(new MouseEvent("click"))
  expect(close).toHaveBeenCalledOnce()
})

it.each(["canvas", "slides", "board"] as const)("uses the %s layout for the learner, download, and editor copy", async layout => {
  const first = await mount()
  view.layout = layout
  await vi.waitFor(() => {
    const frame = view.shadowRoot?.querySelector("iframe")
    expect(frame).not.toBeNull()
    expect(frame?.src).not.toBe(first.src)
  })
  const frame = view.shadowRoot!.querySelector("iframe")!
  const url = new URL(frame.src)
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  message(frame, url.origin, new URLSearchParams(url.hash.slice(1)).get("nonce")!)
  expect(post.mock.calls[0][0].html).toContain(`class="ww-${layout}"`)
  const root = view.shadowRoot!
  expect(root.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe(`/editor/?example=binary&lang=en&layout=${layout}`)
  expect(root.querySelector("a[download]")?.getAttribute("download")).toBe(`binary-${layout}.html`)
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob
  const saved = new DOMParser().parseFromString(await blob.text(), "text/html")
  expect(saved.body.className).toBe(`ww-${layout}`)
  expect(saved.querySelector("webwriter-code-javascript")).not.toBeNull()
  expect(saved.querySelector(".◆editor-only, [contenteditable]")).toBeNull()
  for(const link of saved.querySelectorAll("nav a")) expect(link.getAttribute("href")).toMatch(/^#/)
})
