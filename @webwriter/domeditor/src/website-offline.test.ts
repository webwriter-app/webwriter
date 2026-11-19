// @vitest-environment happy-dom
import {Buffer} from "node:buffer"
import {afterEach, describe, expect, it, vi} from "vitest"
import {sandboxBootstrapSource} from "../../widget/sandbox.js"
import {DOMEditor} from "./domeditor"
import {restoreOriginalResourceURLs} from "./serialization"
import {originalURLAttribute} from "./serialization-primitives"
import {localWebsiteHTML} from "./website-sandbox"

let activeEditor: DOMEditor | undefined
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html")
const dataURL = (html: string) => `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`
const decodeData = (source: string) => Buffer.from(source.slice(source.indexOf(",") + 1), "base64").toString("utf8")
const sourceMarker = originalURLAttribute("src")
const runnerMarker = originalURLAttribute("srcdoc")
const script = 'document.body.append("JS works: Grüße 🌍")'
const localHTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Grüße 🌍</title></head><body><!--retain this comment--><unfamiliar-panel data-authored="ä">Text</unfamiliar-panel><svg xmlns="http://www.w3.org/2000/svg"><circle cx="3" cy="4" r="2"></circle></svg><script>${script}</script></body></html>`

function insertWebsite(source: string) {
  const frame = document.createElement("iframe")
  frame.title = "Local website"
  frame.src = source
  document.body.replaceChildren(frame)
  activeEditor = new DOMEditor()
  return frame
}

function payload(frame: HTMLIFrameElement) {
  const root = parse(frame.getAttribute("srcdoc")!)
  expect(root.querySelectorAll("script")).toHaveLength(2)
  expect(root.querySelectorAll("script")[1].textContent).toBe(sandboxBootstrapSource)
  return JSON.parse(root.querySelector('script[type="application/json"]')!.textContent!) as string
}

afterEach(() => {
  activeEditor?.destroy()
  activeEditor = undefined
  document.head.querySelectorAll("link, style, script[src]").forEach(element => element.remove())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("local website exports", () => {
  it("rejects unresolved imports in an embedded data module", async () => {
    const module = `data:text/javascript,${encodeURIComponent('import("https://example.com/unbundled.js")')}`
    insertWebsite(dataURL(`<script type="module" src="${module}"></script>`))
    await expect(activeEditor!.serializeHTML(true)).rejects.toThrow("module dependency graph")
  })
  it.each([false, true])("exports Unicode local HTML through the sandbox without losing its authored source (offline: %s)", async offline => {
    const source = dataURL(localHTML)
    const liveFrame = insertWebsite(source)
    const exported = parse(await activeEditor!.serializeHTML(offline))
    const frame = exported.querySelector("iframe")!
    const html = payload(frame)
    const website = parse(html)

    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame.getAttribute(runnerMarker)).toBe("")
    expect(localWebsiteHTML(frame.getAttribute("src")!)).toBe(html)
    expect(frame.getAttribute(sourceMarker) ?? frame.getAttribute("src")).toBe(source)
    if(!offline) {
      expect(frame.getAttribute("src")).toBe(source)
      expect(html).toBe(localHTML)
    }
    expect(website.querySelector("script")?.textContent).toBe(script)
    expect(website.title).toBe("Grüße 🌍")
    expect(website.body.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    expect(website.querySelector("unfamiliar-panel")?.getAttribute("data-authored")).toBe("ä")
    expect(website.querySelector("circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(liveFrame.getAttribute("src")).toBe(source)

    restoreOriginalResourceURLs(exported)
    expect(frame.getAttribute("src")).toBe(source)
    expect(localWebsiteHTML(frame.getAttribute("src")!)).toBe(localHTML)
    expect(frame.hasAttribute("srcdoc")).toBe(false)
    expect(frame.hasAttribute(runnerMarker)).toBe(false)
    expect(frame.hasAttribute(sourceMarker)).toBe(false)
  })

  it("preserves the exact percent-encoded source when reopening an online export", async () => {
    const source = `data:text/html;charset=utf-8,${encodeURIComponent(localHTML)}`
    insertWebsite(source)
    const exported = parse(await activeEditor!.serializeHTML())
    const frame = exported.querySelector("iframe")!

    expect(payload(frame)).toBe(localHTML)
    expect(frame.getAttribute("src")).toBe(source)
    restoreOriginalResourceURLs(exported)
    expect(frame.getAttribute("src")).toBe(source)
    expect(frame.hasAttribute("srcdoc")).toBe(false)
  })

  it.each([false, true])("does not nest runner wrappers across export and reopen cycles (offline: %s)", async offline => {
    const source = dataURL(localHTML)
    insertWebsite(source)
    for(let cycle = 0; cycle < 2; cycle++) {
      const exported = parse(await activeEditor!.serializeHTML(offline))
      const frame = exported.querySelector("iframe")!
      const html = payload(frame)

      expect(html).not.toContain(sandboxBootstrapSource)
      expect(parse(html).querySelector("script")?.textContent).toBe(script)
      restoreOriginalResourceURLs(exported)
      expect(frame.getAttribute("src")).toBe(source)
      expect(frame.hasAttribute("srcdoc")).toBe(false)
      activeEditor!.destroy()
      activeEditor = undefined
      document.body.replaceChildren(document.importNode(frame, true))
      activeEditor = new DOMEditor()
    }
  })

  it("embeds a local website's image, stylesheet and classic script dependencies for offline export", async () => {
    const html = '<!doctype html><html><head><link rel="stylesheet" href="https://assets.example/theme.css"></head><body><img src="https://assets.example/picture.png"><script src="https://assets.example/activity.js"></script></body></html>'
    const source = dataURL(html)
    insertWebsite(source)
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input)
      if(url === "https://assets.example/theme.css") return new Response("body { color: rgb(1, 2, 3); }", {headers: {"content-type": "text/css"}})
      if(url === "https://assets.example/picture.png") return new Response(new Uint8Array([1, 2, 3]), {headers: {"content-type": "image/png"}})
      if(url === "https://assets.example/activity.js") return new Response('document.body.append("Downloaded activity")', {headers: {"content-type": "text/javascript"}})
      throw new Error(`Unexpected fetch: ${url}`)
    })
    const exported = parse(await activeEditor!.serializeHTML(true))
    const frame = exported.querySelector("iframe")!
    const website = parse(payload(frame))
    const image = website.querySelector("img")!
    const stylesheet = website.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')!
    const activity = website.querySelector<HTMLScriptElement>("script[src]")!

    expect(image.getAttribute("src")).toBe("data:image/png;base64,AQID")
    expect(stylesheet.getAttribute("href")).toMatch(/^data:text\/css(?:;[^,]*)?;base64,/)
    expect(decodeData(stylesheet.getAttribute("href")!)).toContain("rgb(1, 2, 3)")
    expect(activity.getAttribute("src")).toMatch(/^data:(?:text|application)\/javascript(?:;[^,]*)?;base64,/)
    expect(decodeData(activity.getAttribute("src")!)).toBe('document.body.append("Downloaded activity")')
    expect(new Set(fetcher.mock.calls.map(([input]) => String(input)))).toEqual(new Set([
      "https://assets.example/theme.css", "https://assets.example/picture.png", "https://assets.example/activity.js",
    ]))
    expect(frame.getAttribute(sourceMarker)).toBe(source)
    expect(localWebsiteHTML(frame.getAttribute("src")!)).toBe(payload(frame))

    restoreOriginalResourceURLs(exported)
    expect(frame.getAttribute("src")).toBe(source)
    expect(localWebsiteHTML(frame.getAttribute("src")!)).toBe(html)
    expect(frame.hasAttribute("srcdoc")).toBe(false)
  })

  it("retains the explicit failure for a remote website's unknown offline dependencies", async () => {
    const frame = insertWebsite("https://example.com/activity.html")
    await expect(activeEditor!.serializeHTML(true)).rejects.toThrow("iframe's resource dependencies")
    expect(frame.getAttribute("src")).toBe("https://example.com/activity.html")
  })

  it("preserves authored srcdoc online and rejects its unsupported offline dependencies", async () => {
    const frame = document.createElement("iframe")
    frame.srcdoc = '<p>Authored preview</p><script>document.body.append("Authored")</script>'
    document.body.replaceChildren(frame)
    activeEditor = new DOMEditor()
    const authored = frame.getAttribute("srcdoc")
    const online = parse(await activeEditor.serializeHTML())
    const saved = online.querySelector("iframe")!

    expect(saved.getAttribute("srcdoc")).toBe(authored)
    expect(saved.hasAttribute(runnerMarker)).toBe(false)
    await expect(activeEditor.serializeHTML(true)).rejects.toThrow("iframe's resource dependencies")
    expect(frame.getAttribute("srcdoc")).toBe(authored)
  })
})
