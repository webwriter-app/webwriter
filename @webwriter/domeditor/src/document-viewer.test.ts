// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {mountDocumentReader} from "./document-viewer.js"
import {creativeCommonsLicenses} from "./document-head"
import {formatReferences} from "./reference-format"

let reader: ReturnType<typeof mountDocumentReader>
const settle = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)) }
const controls = () => Array.from(document.body.shadowRoot!.querySelectorAll<HTMLElement>(".◆document-reader-control"))
const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled")
const originalHead = document.head.innerHTML
const printDescriptor = Object.getOwnPropertyDescriptor(window, "print")

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
  if(printDescriptor) Object.defineProperty(window, "print", printDescriptor)
  else Reflect.deleteProperty(window, "print")
  vi.useRealTimers()
  if(fullscreenDescriptor) Object.defineProperty(document, "fullscreenEnabled", fullscreenDescriptor)
  else Reflect.deleteProperty(document, "fullscreenEnabled")
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.removeAttribute("style")
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  document.designMode = "off"
  vi.unstubAllGlobals()
  document.head.innerHTML = originalHead
})

describe("document pane", () => {
  const pane = () => document.body.shadowRoot!.querySelector<HTMLElement>(".◆document-pane")!

  it("keeps the icon group at the page's right edge when metadata is absent", () => {
    document.body.replaceChildren()
    reader = mountDocumentReader()
    expect(pane().querySelector<HTMLButtonElement>(".◆document-copyright")!.hidden).toBe(true)
    expect(pane().style.right).toBe("20px")
    expect(getComputedStyle(pane()).justifyContent).toBe("flex-end")
    expect(Array.from(pane().children).filter(node => !(node as HTMLElement).hidden).map(node => node.className)).toEqual(["◆document-brand", "◆document-pane-actions"])
  })

  it("aligns its right edge to the document and follows layout changes", async () => {
    document.body.style.paddingRight = "24px"
    const rect = vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue({left: 100, top: 0, right: 900, bottom: 400, width: 800, height: 400} as DOMRect)
    reader = mountDocumentReader()
    expect(pane().style.right).toBe(`${window.innerWidth - 876}px`)
    expect(pane().style.width).toBe("360px")
    rect.mockReturnValue({left: 100, top: 0, right: 800, bottom: 400, width: 700, height: 400} as DOMRect)
    window.dispatchEvent(new Event("resize")); await settle()
    expect(pane().style.right).toBe(`${window.innerWidth - 776}px`)
    expect(pane().style.bottom).toBe("")
    expect(document.body.shadowRoot!.querySelector("style")!.textContent).toContain("bottom: 20px")
  })

  it("uses the bottom area when the side gutter is narrow and updates after scrolling", async () => {
    const wide = document.createElement("p")
    wide.textContent = "Wide document content"; document.body.append(wide)
    const rect = vi.spyOn(wide, "getBoundingClientRect").mockReturnValue({left: 20, top: 0, right: window.innerWidth - 20, bottom: window.innerHeight - 80, width: window.innerWidth - 40, height: window.innerHeight - 80} as DOMRect)
    reader = mountDocumentReader()
    expect(pane().hidden).toBe(false)
    expect(pane().style.width).toBe("360px")
    rect.mockReturnValue({left: 20, top: 0, right: window.innerWidth - 20, bottom: window.innerHeight, width: window.innerWidth - 40, height: window.innerHeight} as DOMRect)
    window.dispatchEvent(new Event("scroll")); await settle()
    expect(pane().hidden).toBe(true)
    rect.mockReturnValue({left: 20, top: window.innerHeight, right: window.innerWidth - 20, bottom: window.innerHeight + 100, width: window.innerWidth - 40, height: 100} as DOMRect)
    window.dispatchEvent(new Event("scroll")); await settle()
    expect(pane().hidden).toBe(false)
  })

  it.each([
    ["https://creativecommons.org/licenses/by-nd/4.0/", "cannot distribute modified versions"],
    ["https://creativecommons.org/publicdomain/zero/1.0/", "without requesting permission"],
    ["https://example.test/license", "Review the linked license"],
    ["", "No reuse license is specified"],
  ])("explains reuse according to the declared license %s", (url, explanation) => {
    document.head.insertAdjacentHTML("beforeend", '<meta name="author" content="John Doe">')
    if(url) {
      const license = document.createElement("link"); license.rel = "license"; license.href = url
      document.head.append(license)
    }
    reader = mountDocumentReader(creativeCommonsLicenses)
    pane().querySelector<HTMLButtonElement>(".◆document-copyright")!.click()
    const bubble = pane().querySelector<HTMLElement>(".◆document-reuse")!
    expect(bubble.hidden).toBe(false)
    expect(bubble.textContent).toContain(explanation)
    expect(bubble.querySelector("a")?.getAttribute("href") ?? "").toBe(url)
  })

  it("opens a closable reuse bubble and closes it on focus loss, Escape and window blur", () => {
    document.head.insertAdjacentHTML("beforeend", '<meta name="author" content="John Doe"><link rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">')
    reader = mountDocumentReader(creativeCommonsLicenses)
    const trigger = pane().querySelector<HTMLButtonElement>(".◆document-copyright")!
    const bubble = pane().querySelector<HTMLElement>(".◆document-reuse")!
    expect(trigger.textContent).toBe(`© John Doe ${new Date().getFullYear()}, CC-BY-NC-SA`)
    expect(bubble.hidden).toBe(true)
    trigger.click()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(bubble.hidden).toBe(false)
    expect(bubble.textContent).toContain("noncommercial")
    expect(bubble.textContent).toContain("same or a compatible license")
    expect(bubble.textContent).toContain("Credit John Doe")
    bubble.querySelector<HTMLButtonElement>("button")!.click()
    expect(bubble.hidden).toBe(true)
    expect(document.body.shadowRoot!.activeElement).toBe(trigger)
    trigger.click()
    bubble.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    expect(bubble.hidden).toBe(true)
    trigger.click()
    pane().querySelector<HTMLButtonElement>('[name="print"]')!.focus()
    expect(bubble.hidden).toBe(true)
    trigger.click()
    window.dispatchEvent(new Event("blur"))
    expect(bubble.hidden).toBe(true)
  })

  it("reuses a picked file handle and writes the current document on every save", async () => {
    const write = vi.fn(), close = vi.fn()
    const createWritable = vi.fn().mockResolvedValue({write, close})
    const picker = vi.fn().mockResolvedValue({createWritable})
    vi.stubGlobal("showSaveFilePicker", picker)
    const fallback = vi.spyOn(URL, "createObjectURL")
    reader = mountDocumentReader()
    const save = pane().querySelector<HTMLButtonElement>('[name="save"]')!
    save.click(); save.click()
    await settle()
    expect(picker).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    document.body.querySelector("h1")!.textContent = "Revised"
    save.click(); await settle()
    expect(picker).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledTimes(2)
    expect(await (write.mock.calls[1][0] as Blob).text()).toContain("Revised")
    expect(fallback).not.toHaveBeenCalled()
    expect(save.disabled).toBe(false)
  })

  it("does not download on picker cancellation, but falls back when file access fails", async () => {
    const picker = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"))
    vi.stubGlobal("showSaveFilePicker", picker)
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:document")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    reader = mountDocumentReader()
    const save = pane().querySelector<HTMLButtonElement>('[name="save"]')!
    save.click(); await settle()
    expect(create).not.toHaveBeenCalled()
    picker.mockRejectedValue(new DOMException("Unavailable", "SecurityError"))
    save.click(); await settle()
    expect(create).toHaveBeenCalledOnce()
    picker.mockResolvedValue({createWritable: vi.fn().mockRejectedValue(new Error("Write denied"))})
    save.click(); await settle()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("renders compact copyright information beside minimal icon actions without changing authored content", async () => {
    document.head.insertAdjacentHTML("beforeend", '<meta name="author" content="Ada Lovelace"><link rel="license" href="https://creativecommons.org/licenses/by/4.0/">')
    const authored = document.body.innerHTML
    reader = mountDocumentReader(creativeCommonsLicenses)
    expect(pane().hidden).toBe(false)
    expect(pane().style.width).toBe("360px")
    expect(pane().querySelector(".◆document-copyright")!.textContent).toBe(`© Ada Lovelace ${new Date().getFullYear()}, CC-BY`)
    expect(pane().firstElementChild!.getAttribute("href")).toBe("https://edumix.eu")
    expect(pane().firstElementChild!.getAttribute("target")).toBe("_blank")
    expect(pane().firstElementChild!.getAttribute("rel")).toBe("noopener noreferrer")
    expect(pane().querySelector(".◆document-brand img")).not.toBeNull()
    expect(pane().querySelector<HTMLAnchorElement>(".◆document-reuse a")!.href).toBe("https://creativecommons.org/licenses/by/4.0/")
    expect(Array.from(pane().querySelectorAll(".◆document-pane-actions button:not([hidden])")).map(button => button.getAttribute("aria-label"))).toEqual(["Save document", "Print document"])
    expect(pane().querySelectorAll("button:not([hidden]) svg")).toHaveLength(2)
    expect(document.body.innerHTML).toBe(authored)
    document.head.querySelector('meta[name="author"]')!.setAttribute("content", "Grace Hopper")
    document.head.querySelector('link[rel="license"]')!.setAttribute("href", "javascript:alert(1)")
    await settle()
    expect(pane().textContent).toContain("Grace Hopper")
    expect(pane().querySelector(".◆document-reuse a")).toBeNull()
    reader!.destroy()
    expect(document.body.shadowRoot!.querySelector(".◆document-pane")).toBeNull()
  })

  it("avoids content alongside the bottom row, including widgets in transparent wrappers", async () => {
    const wrapper = document.createElement("div")
    wrapper.style.display = "contents"
    const widget = document.createElement("wide-widget")
    wrapper.append(widget); document.body.append(wrapper)
    const rect = vi.spyOn(widget, "getBoundingClientRect").mockReturnValue({left: 0, top: window.innerHeight - 100, right: window.innerWidth - 100, bottom: window.innerHeight, width: window.innerWidth - 100, height: 100} as DOMRect)
    reader = mountDocumentReader()
    expect(pane().hidden).toBe(true)
    rect.mockReturnValue({left: 100, top: 0, right: window.innerWidth - 180, bottom: 100, width: window.innerWidth - 280, height: 100} as DOMRect)
    window.dispatchEvent(new Event("resize")); await settle()
    expect(pane().hidden).toBe(false)
    expect(pane().style.width).toBe("360px")
    expect(pane().style.right).toBe("20px")
    Object.defineProperty(document, "fullscreenElement", {configurable: true, value: widget})
    document.dispatchEvent(new Event("fullscreenchange")); await settle()
    expect(pane().hidden).toBe(true)
    Reflect.deleteProperty(document, "fullscreenElement")
  })

  it("prints using the platform and permits preview downloads to use the editor save path", () => {
    const print = vi.fn()
    Object.defineProperty(window, "print", {configurable: true, value: print})
    const nativeDownload = vi.spyOn(URL, "createObjectURL")
    const bridge = vi.fn((event: Event) => event.preventDefault())
    window.addEventListener("webwriter-document-save", bridge)
    try {
      reader = mountDocumentReader()
      pane().querySelector<HTMLButtonElement>('[name="print"]')!.click()
      pane().querySelector<HTMLButtonElement>('[name="save"]')!.click()
      expect(print).toHaveBeenCalledOnce()
      expect(bridge).toHaveBeenCalledOnce()
      expect(nativeDownload).not.toHaveBeenCalled()
    } finally { window.removeEventListener("webwriter-document-save", bridge) }
  })

  it("downloads current HTML and revokes its URL without serializing the pane", async () => {
    vi.useFakeTimers()
    document.title = "Research: notes"
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:document")
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    let filename = ""
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) { filename = this.download })
    reader = mountDocumentReader()
    pane().querySelector<HTMLButtonElement>('[name="save"]')!.click()
    expect(filename).toBe("Research- notes.html")
    const blob = create.mock.calls[0][0] as Blob
    expect(blob.type).toBe("text/html;charset=utf-8")
    const source = await blob.text()
    expect(source).toContain('<h1 id="intro">Intro</h1>')
    expect(source).toContain("Research: notes")
    expect(source).not.toContain("◆document-pane")
    reader!.destroy()
    expect(revoke).toHaveBeenCalledWith("blob:document")
    expect(vi.getTimerCount()).toBe(0)
  })
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
    caption.style.lineHeight = "20px"
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
    expect(group.querySelector("a")!.style.top).toBe("386px")
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

  it.each(["above", "below"])("aligns the permalink with the first line of a padded, multiline caption %s the figure", position => {
    const figure = document.querySelector("figure#photo")!
    const caption = figure.querySelector<HTMLElement>("figcaption")!
    if(position === "above") figure.prepend(caption)
    caption.style.cssText = "line-height:28px;padding:14px 0 20px;border-top:2px solid;border-bottom:3px solid"
    const top = position === "above" ? 180 : 390
    vi.spyOn(figure, "getBoundingClientRect").mockReturnValue({left: 140, top: 180, right: 540, bottom: 490, width: 400, height: 310} as DOMRect)
    vi.spyOn(caption, "getBoundingClientRect").mockReturnValue({left: 140, top, right: 540, bottom: top + 100, width: 400, height: 100} as DOMRect)
    reader = mountDocumentReader()!
    const link = controls()[1].querySelector("a")!
    expect(link.style.left).toBe("70px")
    expect(link.style.top).toBe(`${top + 16}px`)
  })

  it("follows captions above figures and falls back to the figure when the caption is removed", async () => {
    const figure = document.querySelector("figure#photo")!
    const caption = figure.querySelector("figcaption")!
    caption.style.lineHeight = "20px"
    figure.prepend(caption)
    vi.spyOn(figure, "getBoundingClientRect").mockReturnValue({left: 140, top: 180, right: 540, bottom: 410, width: 400, height: 230} as DOMRect)
    const captionRect = vi.spyOn(caption, "getBoundingClientRect").mockReturnValue({left: 140, top: 180, right: 540, bottom: 200, width: 400, height: 20} as DOMRect)
    reader = mountDocumentReader()!
    const group = controls()[1]
    const link = group.querySelector("a")!
    expect(link.style.left).toBe("70px")
    expect(link.style.top).toBe("176px")
    expect(link.hash).toBe("#photo")
    captionRect.mockReturnValue({left: 140, top: 220, right: 540, bottom: 240, width: 400, height: 20} as DOMRect)
    window.dispatchEvent(new Event("resize")); await settle(); await settle()
    expect(link.style.top).toBe("216px")
    document.body.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 95, clientY: 230}))
    await settle(); await settle()
    expect(group.hasAttribute("data-permalink-visible")).toBe(true)
    caption.remove()
    await settle(); await settle()
    expect(link.style.top).toBe("180px")
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

describe("document references", () => {
  const appendix = () => document.body.shadowRoot!
  const trigger = () => appendix().querySelector<HTMLButtonElement>('[name="references"]')!
  const panel = () => appendix().querySelector<HTMLElement>(".◆document-references")!

  const reference = (href: string, title: string, extra: Record<string, unknown> = {}) => {
    const anchor = document.createElement("a")
    anchor.href = href
    anchor.setAttribute("data-reference", JSON.stringify({type: "book", title, ...extra}))
    anchor.textContent = "citation"
    return anchor
  }

  it("groups citations by literal href and reports conflicting metadata", () => {
    const authored = document.body.innerHTML
    const one = reference("#source", "First title")
    const same = reference("#source", "First title")
    const conflict = reference("#source", "Different title")
    const url = reference("https://example.test/paper", "Web paper")
    document.body.append(one, same, conflict, url)
    const beforeMount = document.body.innerHTML
    reader = mountDocumentReader()!

    trigger().click()
    expect(panel().hidden).toBe(false)
    expect(panel().textContent).toContain("First title")
    expect(panel().textContent).toContain("Web paper")
    expect(panel().querySelectorAll("[data-reference-href]")).toHaveLength(2)
    expect(panel().textContent).toMatch(/conflict|different metadata/i)
    expect(document.body.innerHTML).toBe(beforeMount)
    expect(authored).not.toBe(beforeMount)
  })

  it("ignores widget references and malformed metadata without preventing the panel from opening", () => {
    const valid = reference("#valid-source", "Valid source")
    const malformed = document.createElement("a")
    malformed.href = "#bad-source"
    malformed.setAttribute("data-reference", "{")
    const widget = document.createElement("custom-reference-widget")
    widget.append(reference("#widget-source", "Widget source"))
    document.body.append(valid, malformed, widget)
    const customizedWidget = document.createElement("span")
    customizedWidget.setAttribute("is", "custom-reference-widget")
    customizedWidget.append(reference("#is-widget-source", "Customized widget source"))
    document.body.append(customizedWidget)
    reader = mountDocumentReader()!

    expect(() => trigger().click()).not.toThrow()
    expect(panel().textContent).toContain("Valid source")
    expect(panel().textContent).not.toContain("Widget source")
    expect(panel().textContent).not.toContain("Customized widget source")
    expect(panel().textContent).not.toContain("bad-source")
  })

  it("refreshes grouped sources when reference metadata changes", async () => {
    const anchor = reference("#mutable", "Before")
    document.body.append(anchor)
    reader = mountDocumentReader()!
    trigger().click()
    expect(panel().textContent).toContain("Before")

    anchor.setAttribute("data-reference", JSON.stringify({type: "book", title: "After"}))
    await settle(); await settle()
    expect(panel().textContent).toContain("After")
    expect(panel().textContent).not.toContain("Before")
  })

  it("intercepts recognized fragment references while leaving URL references to native navigation", () => {
    const fragment = reference("#known-source", "Known source")
    const external = reference("https://example.test/source", "External source")
    document.body.append(fragment, external)
    reader = mountDocumentReader()!
    trigger().click()

    const fragmentClick = new MouseEvent("click", {bubbles: true, cancelable: true})
    fragment.dispatchEvent(fragmentClick)
    expect(fragmentClick.defaultPrevented).toBe(true)
    expect(panel().hidden).toBe(false)

    const externalClick = new MouseEvent("click", {bubbles: true, cancelable: true})
    external.dispatchEvent(externalClick)
    expect(externalClick.defaultPrevented).toBe(false)
  })

  it("removes its appendix UI on destroy and leaves authored references intact", () => {
    const ref = reference("#source", "Source")
    document.body.append(ref)
    const authored = document.body.innerHTML
    reader = mountDocumentReader()!
    trigger().click()
    expect(panel()).toBeTruthy()
    reader.destroy()
    reader = null
    expect(appendix().querySelector('[name="references"]')).toBeNull()
    expect(appendix().querySelector(".◆document-references")).toBeNull()
    expect(document.body.innerHTML).toBe(authored)
  })

  it("copies APA bibliography text and BibTeX from the formatter", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    const ref = reference("#miller", "A useful book", {
      author: [{family: "Miller", given: "Alex"}],
      issued: {"date-parts": [[2021]]},
      publisher: "Example Press",
    })
    document.body.append(ref)
    reader = mountDocumentReader([], "", formatReferences)!
    trigger().click()

    appendix().querySelector<HTMLButtonElement>('[name="copy-references"]')!.click()
    await settle()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toContain("Miller")
    expect(write.mock.calls[0][0]).toContain("2021")

    appendix().querySelector<HTMLButtonElement>('[name="copy-bibtex"]')!.click()
    await settle()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[1][0]).toMatch(/@book/i)
    expect(write.mock.calls[1][0]).toContain("A useful book")
  })

  it("disables both copy actions when references sharing an href conflict", () => {
    document.body.append(reference("#same", "First"), reference("#same", "Second"))
    reader = mountDocumentReader([], "", formatReferences)!
    trigger().click()
    expect(appendix().querySelector<HTMLButtonElement>('[name="copy-references"]')!.disabled).toBe(true)
    expect(appendix().querySelector<HTMLButtonElement>('[name="copy-bibtex"]')!.disabled).toBe(true)
  })

  it("keeps the source title visible when author metadata cannot be formatted", () => {
    document.body.append(reference("#bad-author", "Still visible", {author: "not a CSL name"}))
    reader = mountDocumentReader([], "", formatReferences)!
    trigger().click()
    expect(panel().textContent).toContain("Still visible")
  })

  it("reports clipboard failures in the references panel", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"))
    document.body.append(reference("#clipboard", "Clipboard source"))
    reader = mountDocumentReader([], "", formatReferences)!
    trigger().click()
    appendix().querySelector<HTMLButtonElement>('[name="copy-references"]')!.click()
    await settle()
    expect(panel().querySelector('[role="status"]')!.textContent).toContain("Couldn’t copy references")
  })
})
