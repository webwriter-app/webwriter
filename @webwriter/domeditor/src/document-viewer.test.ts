// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {mountDocumentReader} from "./document-viewer.js"

let reader: ReturnType<typeof mountDocumentReader>
const settle = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)) }
const controls = () => Array.from(document.body.shadowRoot!.querySelectorAll<HTMLElement>(".◆document-reader-control"))
const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled")

beforeEach(() => {
  document.designMode = "off"
  if(fullscreenDescriptor) Object.defineProperty(document, "fullscreenEnabled", fullscreenDescriptor)
  else Reflect.deleteProperty(document, "fullscreenEnabled")
  document.body.className = ""
  document.body.innerHTML = '<h1 id="intro">Intro</h1><figure id="photo"><img src="photo.png"><figcaption>Caption</figcaption></figure><table id="data"><caption>Data</caption><tbody><tr><td>Cell</td></tr></tbody></table><h2>No id</h2><figure><img></figure><custom-box id="inside"><h2 id="hidden">Hidden</h2><figure id="widget-media"><img></figure></custom-box>'
  for(const element of document.querySelectorAll("h1, figure, table, img, figcaption, caption")) {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({left: 100, top: 100, right: 500, bottom: 300, width: 400, height: 200} as DOMRect)
  }
})
afterEach(() => {
  reader?.destroy(); reader = null
  vi.restoreAllMocks()
  vi.useRealTimers()
  if(fullscreenDescriptor) Object.defineProperty(document, "fullscreenEnabled", fullscreenDescriptor)
  else Reflect.deleteProperty(document, "fullscreenEnabled")
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  document.designMode = "off"
})

describe("document reader controls", () => {
  it("keeps authored nodes untouched and adds only permalink/fullscreen controls for eligible targets", () => {
    const authored = document.body.innerHTML
    const nodes = Array.from(document.body.childNodes)
    reader = mountDocumentReader()!
    expect(reader).not.toBeNull()
    expect(document.body.innerHTML).toBe(authored)
    expect(Array.from(document.body.childNodes)).toEqual(nodes)
    const appendix = document.body.shadowRoot!
    expect(appendix.querySelector("slot:not([name])")).not.toBeNull()
    expect(controls()).toHaveLength(4)
    expect(appendix.querySelectorAll('a[aria-label="Copy link to this section"]')).toHaveLength(3)
    expect(appendix.querySelectorAll('button[aria-label="View fullscreen"]')).toHaveLength(3)
    expect(Array.from(appendix.querySelectorAll('button[aria-label="View fullscreen"]')).every(button => (button as HTMLButtonElement).hidden)).toBe(true)
    expect(appendix.querySelector('a[href$="#intro"]')).not.toBeNull()
    expect(appendix.querySelector('a[href$="#hidden"]')).toBeNull()
    expect(appendix.querySelector('a[href$="#widget-media"]')).toBeNull()
    expect(appendix.querySelector('a[href$="#data"]')).not.toBeNull()
    reader.destroy()
    expect(appendix.querySelector("slot:not([name])")).not.toBeNull()
    expect(controls()).toHaveLength(0)
    expect(appendix.querySelector("style")).toBeNull()
  })

  it("calls fullscreen synchronously on figures and tables when allowed", () => {
    const figure = document.querySelector("figure#photo")!
    const table = document.querySelector("table")!
    const figureFullscreen = vi.fn(() => Promise.resolve())
    const tableFullscreen = vi.fn(() => Promise.reject(new Error("denied")))
    Object.assign(figure, {requestFullscreen: figureFullscreen})
    Object.assign(table, {requestFullscreen: tableFullscreen})
    reader = mountDocumentReader()!
    controls().find(control => control.getAttribute("aria-label") === "figure controls")!.querySelector("button")!.click()
    controls().find(control => control.getAttribute("aria-label") === "table controls")!.querySelector("button")!.click()
    expect(figureFullscreen).toHaveBeenCalledOnce()
    expect(tableFullscreen).toHaveBeenCalledOnce()
  })

  it("centers fullscreen content using a disposable document stylesheet without changing authored content", () => {
    const sheets = [...document.adoptedStyleSheets]
    const authored = document.body.innerHTML
    const table = document.querySelector("table")!
    Object.assign(table, {requestFullscreen: vi.fn(() => Promise.resolve())})
    reader = mountDocumentReader()!
    const sheet = document.adoptedStyleSheets.find(sheet => !sheets.includes(sheet))!
    expect(sheet).toBeDefined()
    const figureRule = Array.from(sheet.cssRules).find(rule => (rule as CSSStyleRule).selectorText === "figure:fullscreen") as CSSStyleRule
    expect(figureRule.style.justifyContent).toBe("center")
    expect(figureRule.style.alignItems).toBe("center")
    expect(figureRule.style.getPropertyValue("background")).toBe("#000")
    expect(figureRule.style.getPropertyPriority("background")).toBe("important")
    controls().find(control => control.getAttribute("aria-label") === "table controls")!.querySelector("button")!.click()
    const tableRule = Array.from(sheet.cssRules).find(rule => (rule as CSSStyleRule).selectorText === "table:fullscreen") as CSSStyleRule
    expect(tableRule.style.getPropertyValue("padding-inline")).toContain("400px")
    expect(tableRule.style.getPropertyValue("padding-block")).toContain("200px")
    expect(tableRule.style.display).toBe("")
    expect(tableRule.style.getPropertyValue("background")).toBe("#000")
    const backdrop = Array.from(sheet.cssRules).find(rule => (rule as CSSStyleRule).selectorText.includes("::backdrop")) as CSSStyleRule
    expect(backdrop.style.getPropertyValue("background")).toBe("#000")
    expect(document.body.innerHTML).toBe(authored)
    reader.destroy()
    expect(document.adoptedStyleSheets).toEqual(sheets)
  })

  it("updates for DOM changes and removes controls for disconnected targets", async () => {
    reader = mountDocumentReader()!
    const old = document.querySelector("h1")!
    old.remove()
    const heading = document.createElement("h3"); heading.id = "new"; heading.textContent = "New"
    document.body.append(heading)
    await settle()
    await settle()
    expect(document.body.shadowRoot!.querySelector('a[href$="#intro"]')).toBeNull()
    expect(document.body.shadowRoot!.querySelector('a[href$="#new"]')).not.toBeNull()
  })

  it.each(["canvas", "slides", "widget"]) ("does not mount for %s documents", mode => {
    if(mode === "canvas") document.body.classList.add("ww-canvas")
    if(mode === "slides") document.body.classList.add("ww-slides")
    if(mode === "widget") document.body.innerHTML = '<custom-document role="document"></custom-document>'
    expect(mountDocumentReader()).toBeNull()
  })

  it("cleans up on layout/designMode changes and when fullscreen is unavailable", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {configurable: true, value: false})
    reader = mountDocumentReader()!
    const button = controls()[1].querySelector("button")!
    const fullscreen = vi.fn()
    Object.assign(document.querySelector("figure#photo")!, {requestFullscreen: fullscreen})
    button.click()
    expect(fullscreen).not.toHaveBeenCalled()
    expect(button.hidden).toBe(true)
    document.body.classList.add("ww-slides")
    await settle()
    await settle()
    expect(controls()).toHaveLength(0)
    expect(document.body.shadowRoot!.querySelector("slot:not([name])")).not.toBeNull()

    document.body.classList.remove("ww-slides")
    reader = mountDocumentReader()!
    document.designMode = "on"
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(controls()).toHaveLength(0)
  })

  it("cleans up when body is replaced", async () => {
    reader = mountDocumentReader()!
    const oldBody = document.body
    const newBody = document.createElement("body")
    newBody.innerHTML = "<p>Replacement</p>"
    document.documentElement.replaceChild(newBody, oldBody)
    await settle()
    expect(oldBody.shadowRoot!.querySelector(".◆document-reader-control")).toBeNull()
  })

  it("refreshes encoded permalinks when IDs change and hides offscreen targets", async () => {
    const heading = document.querySelector("h1")!
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({left: -100, top: -100, right: -20, bottom: -60, width: 80, height: 40} as DOMRect)
    reader = mountDocumentReader()!
    const group = controls()[0]
    expect(group.hidden).toBe(true)
    heading.id = "part # % one"
    await settle(); await settle()
    const link = group.querySelector("a")!
    expect(link.textContent).toBe("#")
    expect(link.href).toContain("part%20%23%20%25%20one")
    heading.id = "changed"
    await settle(); await settle()
    expect(link.href).toMatch(/#changed$/)
  })

  it("avoids duplicate mounts and supports no-ID media fullscreen without a permalink", () => {
    const noIdFigure = document.querySelectorAll("figure")[1]
    const table = document.querySelector("table")!
    table.removeAttribute("id")
    const fullscreen = vi.fn(() => Promise.resolve())
    Object.assign(noIdFigure, {requestFullscreen: fullscreen})
    Object.assign(table, {requestFullscreen: vi.fn(() => Promise.resolve())})
    reader = mountDocumentReader()!
    const duplicate = mountDocumentReader()!
    expect(duplicate).toBe(reader)
    const group = controls().find(control => control.getAttribute("aria-label") === "figure controls" && !control.querySelector("a"))!
    expect(group.querySelector("button")).not.toBeNull()
    group.querySelector("button")!.click()
    expect(fullscreen).toHaveBeenCalledOnce()
    const tableGroup = controls().find(control => control.getAttribute("aria-label") === "table controls")!
    expect(tableGroup.querySelector("a")).toBeNull()
    expect(tableGroup.querySelector("button")).not.toBeNull()
    reader.destroy()
    reader = mountDocumentReader()!
    expect(controls()).toHaveLength(4)
  })

  it("hides fullscreen when the API or permissions policy disallows it", () => {
    const figure = document.querySelector("figure#photo")!
    Object.assign(figure, {requestFullscreen: vi.fn()})
    Object.defineProperty(document, "permissionsPolicy", {configurable: true, value: {allowsFeature: () => false}})
    reader = mountDocumentReader()!
    const button = controls().find(control => control.getAttribute("aria-label") === "figure controls")!.querySelector("button")!
    expect(button.hidden).toBe(true)
  })

  it("reveals a minimal gutter permalink only on heading hover, including the gap to the link", async () => {
    const heading = document.querySelector("h1")!
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({left: 120, top: 100, right: 600, bottom: 140, width: 480, height: 40} as DOMRect)
    heading.style.lineHeight = "40px"
    reader = mountDocumentReader()!
    const group = controls()[0]
    const link = group.querySelector("a")!
    expect(group.hasAttribute("data-permalink-visible")).toBe(false)
    expect(link.style.left).toBe("90px")
    expect(link.style.top).toBe("106px")
    heading.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 150, clientY: 120}))
    await settle(); await settle()
    expect(group.hasAttribute("data-permalink-visible")).toBe(true)
    // The control remains reachable across the narrow gutter gap.
    document.body.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 116, clientY: 120}))
    await settle(); await settle()
    expect(group.hasAttribute("data-permalink-visible")).toBe(true)
    document.body.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 150, clientY: 500}))
    await settle(); await settle()
    expect(group.hasAttribute("data-permalink-visible")).toBe(false)
    const style = document.body.shadowRoot!.querySelector("style")!.textContent!
    expect(style).toContain("background: transparent")
    expect(style).toContain("a:focus-visible")
    expect(style).not.toContain("box-shadow")
  })

  it("shows figure permalinks on caption hover and fullscreen only over the media", async () => {
    const figure = document.querySelector("figure#photo")!
    const media = figure.querySelector("img")!
    const caption = figure.querySelector("figcaption")!
    Object.assign(figure, {requestFullscreen: vi.fn(() => Promise.resolve())})
    vi.spyOn(figure, "getBoundingClientRect").mockReturnValue({left: 140, top: 180, right: 540, bottom: 410, width: 400, height: 230} as DOMRect)
    vi.spyOn(media, "getBoundingClientRect").mockReturnValue({left: 140, top: 180, right: 540, bottom: 380, width: 400, height: 200} as DOMRect)
    vi.spyOn(caption, "getBoundingClientRect").mockReturnValue({left: 140, top: 390, right: 540, bottom: 410, width: 400, height: 20} as DOMRect)
    reader = mountDocumentReader()!
    const group = controls()[1]
    const button = group.querySelector("button")!
    expect(group.hasAttribute("data-permalink-visible")).toBe(false)
    expect(group.hasAttribute("data-fullscreen-visible")).toBe(false)
    // Aligned with the heading's column, not the inset figure's left edge.
    expect(group.querySelector("a")!.style.left).toBe("70px")
    expect(group.querySelector("a")!.style.top).toBe("180px")
    expect(button.style.left).toBe("500px")
    expect(button.style.top).toBe("188px")
    caption.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 200, clientY: 400}))
    await settle(); await settle()
    expect(group.hasAttribute("data-permalink-visible")).toBe(true)
    expect(group.hasAttribute("data-fullscreen-visible")).toBe(false)
    media.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 200, clientY: 200}))
    await settle(); await settle()
    expect(group.hasAttribute("data-fullscreen-visible")).toBe(true)
    // Crossing into the overlaid shadow control retains the affordance.
    button.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, composed: true, clientX: 512, clientY: 200}))
    await settle(); await settle()
    expect(group.hasAttribute("data-fullscreen-visible")).toBe(true)
    window.dispatchEvent(new Event("blur"))
    await settle(); await settle()
    expect(group.hasAttribute("data-fullscreen-visible")).toBe(false)
    expect(document.body.shadowRoot!.querySelector("style")!.textContent).toContain("rgb(15 23 42 / .55)")
  })

  it("places fullscreen on the hovered media when a figure contains multiple media elements", async () => {
    const figure = document.querySelector("figure#photo")!
    const second = document.createElement("video")
    figure.append(second)
    Object.assign(figure, {requestFullscreen: vi.fn(() => Promise.resolve())})
    vi.spyOn(figure, "getBoundingClientRect").mockReturnValue({left: 100, top: 100, right: 900, bottom: 300, width: 800, height: 200} as DOMRect)
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue({left: 600, top: 100, right: 900, bottom: 300, width: 300, height: 200} as DOMRect)
    reader = mountDocumentReader()!
    const group = controls()[1]
    const button = group.querySelector("button")!
    second.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 700, clientY: 200}))
    await settle(); await settle()
    expect(group.hasAttribute("data-fullscreen-visible")).toBe(true)
    expect(button.style.left).toBe("860px")
    expect(button.style.top).toBe("108px")
    const authored = document.body.innerHTML
    reader.destroy()
    document.body.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 700, clientY: 200}))
    await settle(); await settle()
    expect(controls()).toHaveLength(0)
    expect(document.body.innerHTML).toBe(authored)
  })

  it("copies the current encoded link without navigation and briefly shows an anchored speech bubble", async () => {
    vi.useFakeTimers()
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    reader = mountDocumentReader()!
    const link = controls()[0].querySelector("a")!
    const bubble = document.body.shadowRoot!.querySelector<HTMLElement>(".◆document-reader-feedback")!
    vi.spyOn(link, "getBoundingClientRect").mockReturnValue({left: 70, top: 110, right: 94, bottom: 138, width: 24, height: 28} as DOMRect)
    vi.spyOn(bubble, "getBoundingClientRect").mockReturnValue({left: 0, top: 0, right: 100, bottom: 28, width: 100, height: 28} as DOMRect)
    // Click before mutation delivery: copy the current ID, not a stale href.
    document.querySelector("h1")!.id = "new # % heading"
    const authored = document.body.innerHTML
    const hash = location.hash
    const event = new MouseEvent("click", {bubbles: true, cancelable: true})
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(write).toHaveBeenCalledWith(expect.stringContaining("#new%20%23%20%25%20heading"))
    await Promise.resolve()
    expect(location.hash).toBe(hash)
    expect(bubble.hidden).toBe(false)
    expect(bubble.textContent).toBe("Link copied!")
    expect(bubble.getAttribute("role")).toBe("status")
    expect(bubble.style.left).toBe("68px")
    expect(bubble.style.top).toBe("74px")
    expect(bubble.style.getPropertyValue("--arrow-position")).toBe("14px")
    await vi.advanceTimersByTimeAsync(1800)
    expect(bubble.hidden).toBe(true)
    expect(document.body.innerHTML).toBe(authored)
  })

  it("reports failed clipboard writes without claiming success", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"))
    reader = mountDocumentReader()!
    controls()[0].querySelector("a")!.click()
    await Promise.resolve(); await Promise.resolve()
    const bubble = document.body.shadowRoot!.querySelector<HTMLElement>(".◆document-reader-feedback")!
    expect(bubble.hidden).toBe(false)
    expect(bubble.textContent).toBe("Couldn’t copy link")
  })

  it("suppresses stale clipboard completions after replacement or destruction", async () => {
    let resolve!: () => void
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(new Promise<void>(done => { resolve = done }))
    reader = mountDocumentReader()!
    controls()[0].querySelector("a")!.click()
    document.querySelector("h1")!.remove()
    resolve()
    await Promise.resolve()
    expect(document.body.shadowRoot!.querySelector<HTMLElement>(".◆document-reader-feedback")!.hidden).toBe(true)
    reader.destroy()
    expect(document.body.shadowRoot!.querySelector(".◆document-reader-feedback")).toBeNull()
  })

  it("restarts feedback on repeated copies and removes the bubble and its timer on teardown", async () => {
    vi.useFakeTimers()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    reader = mountDocumentReader()!
    const link = controls()[0].querySelector("a")!
    link.click()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    link.click()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    const bubble = document.body.shadowRoot!.querySelector<HTMLElement>(".◆document-reader-feedback")!
    expect(bubble.hidden).toBe(false)
    reader.destroy()
    await vi.advanceTimersByTimeAsync(2000)
    expect(bubble.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
