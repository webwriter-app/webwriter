// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {CanvasViewer, mountCanvasReader} from "./canvas-viewer.js"
import {DOMEditor} from "./domeditor"
import {parse} from "es-module-lexer"

let reader: ReturnType<typeof mountCanvasReader>
let editor: DOMEditor | undefined
const initialHead = document.head.innerHTML

beforeEach(() => {
  document.designMode = "off"
  document.body.className = "ww-canvas"
  document.body.innerHTML = '<!--keep--><p style="position:absolute;left:-200px;top:400px">Text</p><test-widget><span>Widget content</span></test-widget>'
})
afterEach(() => {
  reader?.destroy(); reader = null
  editor?.destroy(); editor = undefined
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  document.head.innerHTML = initialHead
  document.designMode = "off"
})
const control = (name: string) => document.body.shadowRoot!.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!
const settle = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)) }

describe("standalone canvas reader", () => {
  it("keeps authored nodes unchanged while navigating and restores the existing appendix", () => {
    const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    const slot = document.createElement("slot")
    slot.setAttribute("style", "color: red")
    const other = document.createElement("aside")
    appendix.replaceChildren(slot, other)
    const content = [...document.body.childNodes]
    const html = document.body.innerHTML
    const sheets = [...document.adoptedStyleSheets]
    reader = mountCanvasReader()!
    expect(reader).not.toBeNull()
    control("zoom-in").click()
    expect(reader.viewer.zoom).toBe(1.2)
    expect(slot.style.transform).toContain("scale(1.2)")
    expect(document.body.innerHTML).toBe(html)
    expect([...document.body.childNodes]).toEqual(content)
    expect(appendix.querySelector('button[name="text"]')).toBeNull()
    expect(mountCanvasReader()).toBeNull()
    reader.destroy()
    expect(slot.getAttribute("style")).toBe("color: red")
    expect(other.isConnected).toBe(true)
    expect(appendix.querySelector("[part=canvas-controls]")).toBeNull()
    expect(document.adoptedStyleSheets).toEqual(sheets)
    expect(document.documentElement.className).not.toContain("◆canvas")
    expect(document.body.className).toBe("ww-canvas")
  })

  it("pans and zooms while leaving forms, widget shadows and scroll containers alone", () => {
    reader = mountCanvasReader()!
    const wheel = (target: Element, ctrlKey = false) => {
      const event = new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaY: 30, ctrlKey})
      Object.defineProperty(event, "ctrlKey", {value: ctrlKey})
      target.dispatchEvent(event)
      return event
    }
    const slot = document.body.shadowRoot!.querySelector("slot")!
    expect(wheel(slot, true).defaultPrevented).toBe(true)
    expect(reader.viewer.zoom).toBeLessThan(1)
    const input = document.createElement("input")
    document.body.append(input)
    expect(wheel(input, true).defaultPrevented).toBe(false)
    const shadow = document.querySelector("test-widget")!.attachShadow({mode: "open"})
    const widgetContent = document.createElement("div"); shadow.append(widgetContent)
    expect(wheel(widgetContent, true).defaultPrevented).toBe(false)
    const scroll = document.createElement("div")
    scroll.style.overflowY = "auto"; document.body.append(scroll)
    vi.spyOn(scroll, "scrollHeight", "get").mockReturnValue(500)
    vi.spyOn(scroll, "clientHeight", "get").mockReturnValue(100)
    expect(wheel(scroll).defaultPrevented).toBe(false)
    slot.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, pointerId: 1, clientX: 10}))
    document.dispatchEvent(new PointerEvent("pointermove", {pointerId: 1, clientX: 50}))
    expect(document.body.classList.contains("◆canvas-panning")).toBe(true)
    window.dispatchEvent(new Event("blur"))
    expect(document.body.classList.contains("◆canvas-panning")).toBe(false)
  })

  it("fits freshly replaced content, including negative coordinates", () => {
    reader = mountCanvasReader()!
    const replacement = document.createElement("p")
    replacement.textContent = "Replacement"
    document.body.replaceChildren(replacement)
    vi.spyOn(replacement, "getBoundingClientRect").mockReturnValue({left: -500, top: -300, right: -300, bottom: -200, width: 200, height: 100} as DOMRect)
    control("fit-content").click()
    expect(document.body.shadowRoot!.querySelector("slot")!.style.transform).toContain("translate(548px, 348px)")
    expect(replacement.hasAttribute("style")).toBe(false)
  })

  it("cleans up on a mode change and releases its slot before editor takeover", async () => {
    reader = mountCanvasReader()!
    control("hand").click()
    document.body.classList.remove("ww-canvas")
    await settle()
    expect(document.body.shadowRoot!.querySelector("[part=canvas-controls]")).toBeNull()
    expect(document.body.className).not.toContain("◆canvas")
    document.body.classList.add("ww-canvas")
    reader = mountCanvasReader()!
    const slot = document.body.shadowRoot!.querySelector("slot")!
    const camera = new CanvasViewer(slot, document.createElement("div"), document.createElement("div"))
    expect(document.body.shadowRoot!.querySelector("[part=canvas-controls]")).toBeNull()
    expect(document.documentElement.classList.contains("◆canvas-active")).toBe(true)
    camera.destroy()
    expect(slot.hasAttribute("style")).toBe(false)
  })

  it("does not mount for other layouts, a document widget, or an active editor", () => {
    document.body.className = "ww-slides"
    expect(mountCanvasReader()).toBeNull()
    document.body.className = "ww-canvas ww-slides"
    expect(mountCanvasReader()).toBeNull()
    document.body.className = "ww-canvas"
    document.body.innerHTML = '<canvas-widget role="document"></canvas-widget>'
    expect(mountCanvasReader()).toBeNull()
    document.body.innerHTML = "<p>Content</p>"
    document.designMode = "on"
    expect(mountCanvasReader()).toBeNull()
  })
})

describe("canvas export assets", () => {
  it("embeds a runnable, import-free runtime in normal and offline HTML only for canvas", async () => {
    editor = new DOMEditor()
    const liveScripts = document.head.querySelectorAll("script").length
    for(const html of [editor.toHTML(), await editor.serializeHTML(), await editor.serializeHTML(true)]) {
      const parsed = new DOMParser().parseFromString(html, "text/html")
      const script = parsed.querySelector<HTMLScriptElement>("#webwriter-canvas-viewer")!
      expect(script?.type).toBe("module")
      expect(script.hasAttribute("src")).toBe(false)
      const [imports] = await parse(script.textContent!)
      expect(imports).toHaveLength(0)
      // Execute the exact serialized source after removing only module export
      // declarations. It must not depend on Vite or any editor globals.
      editor.destroy(); editor = undefined
      document.designMode = "off"
      new Function(script.textContent!.replace(/^export /gm, ""))()
      expect(document.body.shadowRoot!.querySelector("[part=canvas-controls]")).not.toBeNull()
      // A new editor claims and disposes the reader synchronously.
      editor = new DOMEditor()
      expect(document.body.shadowRoot!.querySelectorAll("[part=canvas-controls]")).toHaveLength(1)
    }
    expect(document.head.querySelectorAll("script")).toHaveLength(liveScripts)
    expect(editor.toHTML(true)).not.toContain("webwriter-canvas-viewer")
    const clone = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    editor.features.dependency.appendSerializedAssets(clone)
    expect(clone.querySelectorAll("#webwriter-canvas-viewer")).toHaveLength(1)
    clone.body.className = "ww-slides"
    editor.features.dependency.appendSerializedAssets(clone)
    expect(clone.querySelector("#webwriter-canvas-viewer")).toBeNull()
    document.body.className = ""
    expect(editor.toHTML()).not.toContain("webwriter-canvas-viewer")
  })
})
