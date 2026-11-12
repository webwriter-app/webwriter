// @vitest-environment happy-dom
import {hasPresentationState, setPresentationState} from "./presentation-state.js"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {CanvasViewer, canvasStartingView, mountCanvasReader} from "./canvas-viewer.js"
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
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  document.head.innerHTML = initialHead
  document.designMode = "off"
})
const control = (name: string) => document.body.shadowRoot!.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!
const settle = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)) }
const cameraFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const mockCameraCanvas = () => {
  const context = {setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn()}
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D)
  let resize!: (width: number, height: number) => void
  const disconnect = vi.fn()
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      resize = (width, height) => this.callback([{target, contentRect: new DOMRect(0, 0, width, height)} as ResizeObserverEntry], this)
      resize(200, 100)
    }
    unobserve() {}
    disconnect = disconnect
  })
  return {context, resize: (width: number, height: number) => resize(width, height), disconnect}
}

describe("standalone canvas reader", () => {
  it.each(["native", "blank", "tainted"])("uses native rasterization when usable and cleans up the %s capture", async mode => {
    const {context} = mockCameraCanvas()
    const draw = vi.fn(), fallback = vi.fn(async () => ({src: "data:image/png,fallback"}))
    const connected = vi.fn(), tag = `capture-widget-${mode}`
    customElements.define(tag, class extends HTMLElement { connectedCallback() { connected() } })
    Object.assign(context, {
      drawElementImage: draw, scale: vi.fn(),
      getImageData: () => {
        if(mode === "tainted") throw new DOMException("Tainted", "SecurityError")
        return {data: new Uint8ClampedArray([0, 0, 0, mode === "native" ? 255 : 0])}
      },
    })
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png,native")
    vi.spyOn(document.querySelector("p")!, "getBoundingClientRect").mockReturnValue(new DOMRect(-40, 20, 200, 100))
    const snapshot = vi.fn(async (_element, options) => {
      const clone = document.createElement("div")
      clone.innerHTML = `<${tag} onclick="throw 1"><input autofocus value="Keep"></${tag}>`
      await options.plugins[0].beforeRender({clone, classCSS: "div { color: red }"})
      expect(clone.querySelector(`${tag}[onclick]`)).not.toBeNull()
      return {meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60}, toPng: fallback}
    })
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const map = control("minimap"), image = map.querySelector("image")!
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe(`data:image/png,${mode === "native" ? "native" : "fallback"}`))
    expect(draw).toHaveBeenCalledOnce()
    const viewport = draw.mock.calls[0][0] as HTMLElement
    expect(viewport.inert).toBe(true)
    expect(viewport.shadowRoot!.querySelector(`${tag}, [onclick], [autofocus]`)).toBeNull()
    expect(viewport.shadowRoot!.querySelector("input")?.value).toBe("Keep")
    expect(connected).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledTimes(mode === "native" ? 0 : 1)
    expect(document.body.shadowRoot!.querySelector('[part="canvas-minimap-measurements"] canvas')).toBeNull()
    if(mode === "native") {
      expect(image.getAttribute("x")).toBe("0")
      expect(image.getAttribute("y")).toBe("0")
      expect(Number(image.getAttribute("width"))).toBe(Number(map.querySelector("svg")!.getAttribute("viewBox")!.split(" ")[2]))
    }
    expect(document.body.querySelector("canvas, [drawable], [layoutsubtree]")).toBeNull()
  })

  it("uses block sizing for captioned pictures in both canvas modes", () => {
    document.body.innerHTML = '<figure><picture style="width: 320px"><img alt="Map"></picture><figcaption>Map</figcaption></figure>'
    const picture = document.querySelector("picture")!
    editor = new DOMEditor()
    expect(getComputedStyle(picture).display).toBe("block")
    editor.destroy(); editor = undefined

    reader = mountCanvasReader()
    expect(reader).not.toBeNull()
    expect(getComputedStyle(picture).display).toBe("block")
    expect(getComputedStyle(picture).width).toBe("320px")
  })

  it("fits the minimap to the viewport ratio and refreshes content and settled resizes only while open", async () => {
    const {context} = mockCameraCanvas()
    const resize = (width: number, height: number) => {
      vi.stubGlobal("innerWidth", width)
      vi.stubGlobal("innerHeight", height)
      window.dispatchEvent(new Event("resize"))
    }
    resize(1000, 500)
    document.body.innerHTML = '<p>Near</p><p>Far</p><div class="ww-canvas-starting-view"></div>'
    const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    const slot = document.createElement("slot")
    appendix.replaceChildren(slot)
    const rect = (left: number, top: number, width: number, height: number) => ({
      left, top, width, height, right: left + width, bottom: top + height,
    } as DOMRect)
    const camera = () => slot.style.transform.match(/[-\d.]+(?=px|\))/g)?.map(Number) ?? [0, 0, 1]
    vi.spyOn(slot, "getBoundingClientRect").mockImplementation(() => {
      const [x, y, zoom] = camera()
      return rect(x, y, 1280 * zoom, 720 * zoom)
    })
    for(const [index, item] of [...document.body.children].entries()) {
      vi.spyOn(item, "getBoundingClientRect").mockImplementation(() => {
        const [x, y, zoom] = camera()
        const position = Math.min(index, 1)
        return rect(x + (position * 500 - 200) * zoom, y + (position * 200 - 50) * zoom, 100 * zoom, 60 * zoom)
      })
    }
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: -288, y: -114}, contentX: 2, contentY: 2, vbW: 780, vbH: 392},
      toPng: async () => ({src: "data:image/png,preview"}),
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const toggle = control("minimap-toggle"), map = control("minimap"), svg = map.querySelector("svg")!
    const viewBoxSize = () => svg.getAttribute("viewBox")!.split(" ").slice(2).map(Number)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(map.hidden).toBe(false)
    await settle()
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(snapshot).toHaveBeenCalledWith(slot, expect.objectContaining({fast: false}))
    expect(viewBoxSize()).toEqual([expect.closeTo(776), expect.closeTo(388)])
    reader.viewer.zoomAt(1)
    await cameraFrame()
    const initialWidth = context.strokeRect.mock.lastCall![2]
    control("zoom-in").click()
    await cameraFrame()
    expect(context.strokeRect.mock.lastCall![2]).toBeCloseTo(initialWidth / 1.2)
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(rect(500, 0, 188, 94))
    const before = context.strokeRect.mock.lastCall![0]
    map.dispatchEvent(new MouseEvent("click", {detail: 1, clientX: 641, clientY: 47}))
    await cameraFrame()
    expect(context.strokeRect.mock.lastCall![0]).not.toBe(before)
    expect(reader.viewer.clientPoint(window.innerWidth / 2, window.innerHeight / 2)).toEqual({
      x: expect.closeTo(294), y: expect.closeTo(80),
    })
    const pointer = (type: string, x: number, y: number, pointerId = 7) => map.dispatchEvent(
      new PointerEvent(type, {pointerId, isPrimary: true, clientX: x, clientY: y}),
    )
    const capture = vi.spyOn(map, "setPointerCapture").mockImplementation(() => {})
    pointer("pointerdown", 641, 47)
    expect(capture).toHaveBeenCalledWith(7)
    pointer("pointermove", 594, 47)
    expect(reader.viewer.clientPoint(window.innerWidth / 2, window.innerHeight / 2)).toEqual({
      x: expect.closeTo(100), y: expect.closeTo(80),
    })
    pointer("pointermove", 710, -10)
    expect(reader.viewer.clientPoint(window.innerWidth / 2, window.innerHeight / 2)).toEqual({
      x: expect.closeTo(488), y: expect.closeTo(-114),
    })
    const dragged = slot.style.transform
    pointer("pointermove", 594, 47, 8)
    pointer("pointercancel", 710, -10)
    pointer("pointermove", 594, 47)
    expect(slot.style.transform).toBe(dragged)
    expect(reader.viewer.zoom).toBeCloseTo(1.2)
    setPresentationState(document.body.firstElementChild!, "element-selected")
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(1)

    document.body.firstElementChild!.textContent = "Changed while open"
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(2))
    toggle.click()
    expect(map.hidden).toBe(true)
    document.body.firstElementChild!.textContent = "Changed while collapsed"
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(2)
    toggle.click()
    expect(map.hidden).toBe(false)
    await settle()
    expect(snapshot).toHaveBeenCalledTimes(3)

    vi.useFakeTimers()
    try {
      resize(800, 600)
      await vi.advanceTimersByTimeAsync(80)
      resize(500, 1000)
      expect(map.parentElement!.style.getPropertyValue("--canvas-minimap-ratio")).toBe("0.5")
      await vi.advanceTimersByTimeAsync(80)
      expect(snapshot).toHaveBeenCalledTimes(3)
      expect(viewBoxSize()).toEqual([expect.closeTo(776), expect.closeTo(388)])
      await vi.advanceTimersByTimeAsync(80)
      expect(snapshot).toHaveBeenCalledTimes(4)
      expect(viewBoxSize()).toEqual([expect.closeTo(728), expect.closeTo(1456)])
      toggle.click()
      resize(1000, 500)
      await vi.advanceTimersByTimeAsync(160)
      expect(snapshot).toHaveBeenCalledTimes(4)
      toggle.click()
      await vi.advanceTimersByTimeAsync(0)
      expect(snapshot).toHaveBeenCalledTimes(5)
      expect(viewBoxSize()).toEqual([expect.closeTo(776), expect.closeTo(388)])
    }
    finally { vi.useRealTimers() }
    reader.destroy()
    expect(appendix.querySelector("[part=canvas-minimap]")).toBeNull()
  })

  it("reuses an unchanged capture across toggles and duplicate resize and attribute events", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: "data:image/png,cached"}),
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const toggle = control("minimap-toggle"), image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(image.hasAttribute("href")).toBe(true))
    toggle.click()
    toggle.click()
    window.dispatchEvent(new Event("resize"))
    paragraph.setAttribute("style", paragraph.getAttribute("style")!)
    setPresentationState(paragraph, "element-selected")
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(1)

    toggle.click()
    paragraph.firstChild!.textContent = "Remote edit while collapsed"
    // Reopen in the same task, before MutationObserver delivery.
    toggle.click()
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(2))
    toggle.click()
    paragraph.textContent = "Another edit"
    await settle()
    expect(snapshot).toHaveBeenCalledTimes(2)
    toggle.click()
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(3))

    const widget = document.querySelector("test-widget")!
    widget.setAttribute("value", "Changed by widget")
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(4))
  })

  it("updates the camera outline without reading layout during panning", async () => {
    const {context} = mockCameraCanvas()
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    const slot = document.createElement("slot")
    appendix.replaceChildren(slot)
    const slotRect = vi.spyOn(slot, "getBoundingClientRect").mockImplementation(() => {
      const [x = 0, y = 0, zoom = 1] = slot.style.transform.match(/[-\d.]+(?=px|\))/g)?.map(Number) ?? []
      return new DOMRect(37 + x, 19 + y, 1280 * zoom, 720 * zoom)
    })
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: "data:image/png,camera"}),
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    await vi.waitFor(() => expect(control("minimap").querySelector("image")!.hasAttribute("href")).toBe(true))
    const [x, y] = context.strokeRect.mock.lastCall!
    const [, , width, height] = control("minimap").querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number)
    slotRect.mockClear()
    reader.viewer.startPan(new PointerEvent("pointerdown", {pointerId: 7, clientX: 20, clientY: 30}))
    reader.viewer.movePan(new PointerEvent("pointermove", {buttons: 1, pointerId: 7, clientX: 50, clientY: 70}))
    await cameraFrame()
    const [left, top] = context.strokeRect.mock.lastCall!
    expect(left).toBeCloseTo(x - 30 / reader.viewer.zoom / width * 200)
    expect(top).toBeCloseTo(y - 40 / reader.viewer.zoom / height * 100)
    expect(slotRect).not.toHaveBeenCalled()
    reader.viewer.stopPan()
    expect(snapshot).toHaveBeenCalledTimes(1)
  })

  it("rasterizes once and coalesces camera moves without changing minimap DOM", async () => {
    const {context, disconnect} = mockCameraCanvas()
    vi.spyOn(document.querySelector("p")!, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const rasterize = vi.fn(async () => ({src: "data:image/png,bitmap"}))
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: rasterize,
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const map = control("minimap"), svg = map.querySelector("svg")!, image = map.querySelector("image")!
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,bitmap"))
    const viewport = map.querySelector<HTMLCanvasElement>(".◆canvas-minimap-camera")!
    expect(viewport.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    expect(svg.contains(viewport)).toBe(false)
    const originalSVG = svg.outerHTML, originalCanvas = viewport.outerHTML
    const originalPosition = context.strokeRect.mock.lastCall!
    const [, , width, height] = svg.getAttribute("viewBox")!.split(" ").map(Number)
    context.strokeRect.mockClear()
    const callbacks: FrameRequestCallback[] = []
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => callbacks.push(callback))
    const cancel = vi.spyOn(window, "cancelAnimationFrame")
    reader.viewer.startPan(new PointerEvent("pointerdown", {pointerId: 7, clientX: 0, clientY: 0}))
    for(let i = 1; i <= 10; i++) reader.viewer.movePan(new PointerEvent("pointermove", {buttons: 1, pointerId: 7, clientX: i * 10, clientY: i * 5}))
    expect(request).toHaveBeenCalledTimes(1)
    expect(context.strokeRect).not.toHaveBeenCalled()
    callbacks[0](performance.now())
    const [x, y] = context.strokeRect.mock.lastCall!
    expect(x).toBeCloseTo(originalPosition[0] - 100 / reader.viewer.zoom / width * 200)
    expect(y).toBeCloseTo(originalPosition[1] - 50 / reader.viewer.zoom / height * 100)
    expect(context.strokeRect).toHaveBeenCalledTimes(1)
    expect(viewport.outerHTML).toBe(originalCanvas)
    expect(svg.outerHTML).toBe(originalSVG)
    expect(rasterize).toHaveBeenCalledTimes(1)

    reader.viewer.movePan(new PointerEvent("pointermove", {buttons: 1, pointerId: 7, clientX: 200, clientY: 100}))
    context.strokeRect.mockClear()
    control("minimap-toggle").click()
    expect(cancel).toHaveBeenCalledWith(2)
    callbacks[1](performance.now())
    expect(context.strokeRect).not.toHaveBeenCalled()
    reader.destroy()
    expect(disconnect).toHaveBeenCalled()
    expect(map.isConnected).toBe(false)
  })

  it("sizes the camera bitmap for container resizes and display pixel density", async () => {
    const {context, resize} = mockCameraCanvas()
    vi.spyOn(document.querySelector("p")!, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: "data:image/png,bitmap"}),
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    await vi.waitFor(() => expect(control("minimap").querySelector("image")!.hasAttribute("href")).toBe(true))
    const viewport = control("minimap").querySelector<HTMLCanvasElement>("canvas")!
    vi.stubGlobal("devicePixelRatio", 2)
    resize(150, 75)
    expect([viewport.width, viewport.height]).toEqual([300, 150])
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
    vi.stubGlobal("devicePixelRatio", 1)
    window.dispatchEvent(new Event("resize"))
    expect([viewport.width, viewport.height]).toEqual([150, 75])
    expect(snapshot).toHaveBeenCalledTimes(1)
  })

  it("discards rasterization invalidated by an authored edit", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    let finish!: (value: {src: string}) => void
    const pending = new Promise<{src: string}>(resolve => { finish = resolve })
    const rasterize = vi.fn(async () => ({src: "data:image/png,fresh"})).mockImplementationOnce(() => pending)
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: rasterize,
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(rasterize).toHaveBeenCalledTimes(1))
    paragraph.textContent = "Changed during rasterization"
    await settle()
    finish({src: "data:image/png,stale"})
    await settle()
    expect(image.hasAttribute("href")).toBe(false)
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,fresh"))
    expect(snapshot).toHaveBeenCalledTimes(2)
  })

  it("retains the previous bitmap when rasterization fails and retries on reopening", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const rasterize = vi.fn(async () => ({src: "data:image/png,current"}))
      .mockResolvedValueOnce({src: "data:image/png,previous"}).mockRejectedValueOnce(new Error("Rasterization failed"))
    const snapshot = vi.fn(async () => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: rasterize,
    }))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,previous"))
    paragraph.textContent = "Updated content"
    await vi.waitFor(() => expect(rasterize).toHaveBeenCalledTimes(2))
    await settle()
    expect(image.getAttribute("href")).toBe("data:image/png,previous")
    control("minimap-toggle").click()
    control("minimap-toggle").click()
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,current"))
  })

  it("discards a yielding capture invalidated by an authored edit", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const result = (name: string) => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: `data:image/png,${name}`}),
    })
    let finish!: (value: ReturnType<typeof result>) => void
    const pending = new Promise<ReturnType<typeof result>>(resolve => { finish = resolve })
    const snapshot = vi.fn(async () => result("fresh")).mockImplementationOnce(() => pending)
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1))
    paragraph.textContent = "Changed during capture"
    await settle()
    finish(result("stale"))
    await settle()
    expect(image.hasAttribute("href")).toBe(false)
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,fresh"))
    expect(snapshot).toHaveBeenCalledTimes(2)
  })

  it("waits for panning to settle before retrying a yielding capture", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const result = (name: string) => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: `data:image/png,${name}`}),
    })
    let finish!: (value: ReturnType<typeof result>) => void
    const pending = new Promise<ReturnType<typeof result>>(resolve => { finish = resolve })
    const snapshot = vi.fn(async () => result("settled")).mockImplementationOnce(() => pending)
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1))
    reader.viewer.startPan(new PointerEvent("pointerdown", {pointerId: 7, clientX: 10, clientY: 20}))
    reader.viewer.movePan(new PointerEvent("pointermove", {buttons: 1, pointerId: 7, clientX: 50, clientY: 60}))
    finish(result("moving"))
    await new Promise(resolve => setTimeout(resolve, 180))
    expect(snapshot).toHaveBeenCalledTimes(1)
    const image = control("minimap").querySelector("image")!
    expect(image.hasAttribute("href")).toBe(false)
    reader.viewer.stopPan()
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,settled"))
    expect(snapshot).toHaveBeenCalledTimes(2)
  })

  it("defers minimap snapshots and discards an in-flight image across a pause", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const result = (name: string) => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: `data:image/png,${name}`}),
    })
    let resolveInitial!: (value: ReturnType<typeof result>) => void
    const initial = new Promise<ReturnType<typeof result>>(resolve => { resolveInitial = resolve })
    const snapshot = vi.fn(async () => result("current")).mockImplementationOnce(() => initial)
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1))

    reader.viewer.setMinimapRefreshPaused(true)
    paragraph.style.width = "200px"
    resolveInitial(result("stale"))
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(image.hasAttribute("href")).toBe(false)

    reader.viewer.setMinimapRefreshPaused(false)
    await new Promise(resolve => setTimeout(resolve, 420))
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,current"))
    expect(snapshot).toHaveBeenCalledTimes(2)

    paragraph.style.width = "220px"
    await settle()
    reader.viewer.setMinimapRefreshPaused(true)
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(2)
    reader.viewer.setMinimapRefreshPaused(false)
    await new Promise(resolve => setTimeout(resolve, 420))
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(3))
  })

  it("keeps the previous thumbnail during consecutive paused gestures and cancels stale SnapDOM work", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const result = (name: string) => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: `data:image/png,${name}`}),
    })
    const options: any[] = []
    let finishStale!: (value: ReturnType<typeof result>) => void
    const stale = new Promise<ReturnType<typeof result>>(resolve => { finishStale = resolve })
    const snapshot = vi.fn(async (_slot, value) => {
      options.push(value)
      return options.length === 2 ? stale : result(`capture-${options.length}`)
    })
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,capture-1"))

    paragraph.textContent = "First edit"
    await settle()
    reader.viewer.setMinimapRefreshPaused(true)
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(image.getAttribute("href")).toBe("data:image/png,capture-1")

    paragraph.textContent = "Second edit"
    await settle()
    reader.viewer.setMinimapRefreshPaused(false)
    await new Promise(resolve => setTimeout(resolve, 200))
    reader.viewer.setMinimapRefreshPaused(true)
    await new Promise(resolve => setTimeout(resolve, 160))
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(image.getAttribute("href")).toBe("data:image/png,capture-1")

    reader.viewer.setMinimapRefreshPaused(false)
    await new Promise(resolve => setTimeout(resolve, 420))
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(2))
    reader.viewer.setMinimapRefreshPaused(true)
    const staleOptions = options[1]
    expect(staleOptions.exclude(paragraph)).toBe(true)
    expect(() => staleOptions.plugins[0].beforeClone({options: {}})).toThrow()
    finishStale(result("stale"))
    await settle()
    expect(image.getAttribute("href")).toBe("data:image/png,capture-1")

    reader.viewer.setMinimapRefreshPaused(false)
    await new Promise(resolve => setTimeout(resolve, 420))
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(3))
    expect(image.getAttribute("href")).toBe("data:image/png,capture-3")
  })

  it("keeps the full idle deadline when stale capture cleanup and new invalidations reschedule", async () => {
    const paragraph = document.querySelector("p")!
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 18, 100, 60))
    const result = (name: string) => ({
      meta: {clip: {x: 0, y: 0}, contentX: 0, contentY: 0, vbW: 100, vbH: 60},
      toPng: async () => ({src: `data:image/png,${name}`}),
    })
    let finishStale!: (value: ReturnType<typeof result>) => void
    const stale = new Promise<ReturnType<typeof result>>(resolve => { finishStale = resolve })
    const snapshot = vi.fn(async () => snapshot.mock.calls.length === 1
      ? result("initial") : snapshot.mock.calls.length === 2 ? stale : result("latest"))
    reader = mountCanvasReader(() => snapshot as unknown as typeof import("@zumer/snapdom").snapdom)!
    const image = control("minimap").querySelector("image")!
    await vi.waitFor(() => expect(image.getAttribute("href")).toBe("data:image/png,initial"))

    vi.useFakeTimers()
    try {
      Reflect.get(reader.viewer, "minimap").invalidate()
      await vi.advanceTimersByTimeAsync(120)
      expect(snapshot).toHaveBeenCalledTimes(2)
      reader.viewer.setMinimapRefreshPaused(true)
      reader.viewer.setMinimapRefreshPaused(false)

      await vi.advanceTimersByTimeAsync(250)
      finishStale(result("stale"))
      await Promise.resolve()
      await Promise.resolve()
      Reflect.get(reader.viewer, "minimap").invalidate()
      await vi.advanceTimersByTimeAsync(149)
      expect(snapshot).toHaveBeenCalledTimes(2)
      expect(image.getAttribute("href")).toBe("data:image/png,initial")

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(3))
      expect(image.getAttribute("href")).toBe("data:image/png,latest")
    }
    finally { vi.useRealTimers() }
  })

  it("uses only a direct uncustomized starting-view div", () => {
    document.body.innerHTML = '<div class="ww-canvas-starting-view" id="nested"><div></div></div>'
    expect(canvasStartingView()).toBe(document.getElementById("nested"))
    const nested = document.createElement("section")
    nested.innerHTML = '<div class="ww-canvas-starting-view" id="indirect"></div>'
    document.body.append(nested)
    expect(canvasStartingView()).toBe(document.getElementById("nested"))
    const customized = document.createElement("div")
    customized.className = "ww-canvas-starting-view"
    customized.setAttribute("is", "custom-frame")
    document.body.append(customized)
    expect(canvasStartingView()).toBe(document.getElementById("nested"))
    document.getElementById("nested")!.remove()
    expect(canvasStartingView()).toBeNull()
  })

  it.each([
    {left: -400, top: -250, width: 200, height: 100},
    {left: 300, top: 180, width: 100, height: 600},
  ])("fits starting view $width × $height without padding and centers it", frameRect => {
    document.body.innerHTML = '<div class="ww-canvas-starting-view"></div><p>Outside frame</p>'
    const frame = document.body.firstElementChild!
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      ...frameRect, right: frameRect.left + frameRect.width, bottom: frameRect.top + frameRect.height,
    } as DOMRect)
    const apply = vi.spyOn(CanvasViewer.prototype, "applyCamera")
    reader = mountCanvasReader()!
    expect(apply).toHaveBeenCalledTimes(1)
    const zoom = Math.min(window.innerWidth / frameRect.width, window.innerHeight / frameRect.height)
    expect(reader.viewer.zoom).toBeCloseTo(zoom)
    const slot = document.body.shadowRoot!.querySelector("slot")!
    const match = slot.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!
    expect(Number(match[1]) + frameRect.left * zoom).toBeCloseTo((window.innerWidth - frameRect.width * zoom) / 2)
    expect(Number(match[2]) + frameRect.top * zoom).toBeCloseTo((window.innerHeight - frameRect.height * zoom) / 2)
    expect(reader.viewer.items()).not.toContain(frame)
  })

  it.each([
    {left: 0, top: 0, right: 0, bottom: 100, width: 0, height: 100},
    {left: 0, top: 0, right: 100, bottom: 100, width: Number.NaN, height: 100},
    {left: 0, top: 0, right: 100, bottom: 100, width: 100, height: Number.POSITIVE_INFINITY},
  ])("falls back to fit-content for an invalid starting frame", rect => {
    document.body.innerHTML = '<div class="ww-canvas-starting-view"></div><p>Content</p>'
    vi.spyOn(document.body.firstElementChild!, "getBoundingClientRect").mockReturnValue(rect as DOMRect)
    const apply = vi.spyOn(CanvasViewer.prototype, "applyCamera")
    reader = mountCanvasReader()!
    expect(apply).toHaveBeenCalledTimes(1)
    expect(reader.viewer.zoom).toBe(1)
  })

  it("keeps starting bounds out of hit testing without relying on saved layout styles", async () => {
    document.body.innerHTML += '<div class="ww-canvas-starting-view" style="position:absolute;width:900px;height:600px"></div>'
    const frame = canvasStartingView()!
    const authored = document.body.innerHTML
    expect(getComputedStyle(frame).pointerEvents).not.toBe("none")
    reader = mountCanvasReader()!
    expect(getComputedStyle(frame).visibility).toBe("hidden")
    expect(getComputedStyle(frame).pointerEvents).toBe("none")
    expect(document.body.innerHTML).toBe(authored)
    const replacement = frame.cloneNode(true) as HTMLDivElement
    frame.replaceWith(replacement)
    await settle()
    expect(getComputedStyle(replacement).pointerEvents).toBe("none")
    expect(getComputedStyle(document.querySelector("test-widget")!).visibility).not.toBe("hidden")
    reader.destroy()
    expect(getComputedStyle(replacement).pointerEvents).not.toBe("none")
    expect(document.body.innerHTML).toBe(authored)
  })

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
    const reset = control("actual-size")
    expect(reset.disabled).toBe(true)
    control("zoom-in").click()
    expect(reader.viewer.zoom).toBe(1.2)
    expect(slot.style.transform).toContain("scale(1.2)")
    expect(reset.disabled).toBe(false)
    reset.click()
    expect(reader.viewer.zoom).toBe(1)
    expect(reset.disabled).toBe(true)
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
    document.dispatchEvent(new PointerEvent("pointermove", {buttons: 1, pointerId: 1, clientX: 50}))
    expect(hasPresentationState(document.body, "canvas-panning")).toBe(true)
    window.dispatchEvent(new Event("blur"))
    expect(hasPresentationState(document.body, "canvas-panning")).toBe(false)
  })

  it("keeps a background wheel pan when later events target an interactive widget", () => {
    vi.useFakeTimers()
    try {
      reader = mountCanvasReader()!
      const appendix = document.body.shadowRoot!, slot = appendix.querySelector("slot")!
      const shield = appendix.querySelector<HTMLElement>('[part="canvas-pan-surface"]')!
      const map = document.createElement("div")
      document.querySelector("test-widget")!.attachShadow({mode: "open"}).append(map)
      const onWheel = vi.fn()
      map.addEventListener("wheel", onWheel)
      const wheel = (target: Element) => {
        const event = new WheelEvent("wheel", {bubbles: true, composed: true, cancelable: true, deltaX: 30, deltaY: -15})
        target.dispatchEvent(event)
        return event
      }
      expect(wheel(map).defaultPrevented).toBe(false)
      expect(onWheel).toHaveBeenCalledTimes(1)
      expect(wheel(slot).defaultPrevented).toBe(true)
      expect(shield.hidden).toBe(false)
      vi.advanceTimersByTime(100)
      const camera = slot.style.transform
      expect(wheel(map).defaultPrevented).toBe(true)
      expect(slot.style.transform).not.toBe(camera)
      expect(onWheel).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(100)
      expect(shield.hidden).toBe(false)
      vi.advanceTimersByTime(100)
      expect(shield.hidden).toBe(true)
      expect(wheel(map).defaultPrevented).toBe(false)
      expect(onWheel).toHaveBeenCalledTimes(2)
    }
    finally { vi.useRealTimers() }
  })

  it("fits freshly replaced content, including negative coordinates", () => {
    reader = mountCanvasReader()!
    const replacement = document.createElement("p")
    replacement.textContent = "Replacement"
    document.body.replaceChildren(replacement)
    vi.spyOn(replacement, "getBoundingClientRect").mockReturnValue({left: -500, top: -300, right: -300, bottom: -200, width: 200, height: 100} as DOMRect)
    control("fit-content").click()
    const x = (window.innerWidth - 200) / 2 + 500, y = (window.innerHeight - 100) / 2 + 300
    expect(document.body.shadowRoot!.querySelector("slot")!.style.transform).toContain(`translate(${x}px, ${y}px)`)
    expect(replacement.hasAttribute("style")).toBe(false)
  })

  it("ignores retargeted appendix focus while revealing authored controls", () => {
    reader = mountCanvasReader()!
    const reveal = vi.spyOn(reader.viewer, "reveal")
    const appendix = document.body.shadowRoot!
    const button = control("zoom-in")
    const focus = new FocusEvent("focusin", {bubbles: true, composed: true})
    // Native shadow focus reaches the document with BODY as its target.
    vi.spyOn(focus, "composedPath").mockReturnValue([button, appendix, document.body, document.documentElement, document, window])
    document.body.dispatchEvent(focus)
    expect(reveal).not.toHaveBeenCalled()

    const input = document.createElement("input")
    document.body.append(input)
    const bounds = new DOMRect(-40, -20, 100, 30)
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue(bounds)
    input.focus()
    expect(reveal).toHaveBeenCalledExactlyOnceWith(bounds)
  })

  it.each([.5, 2])("centers transformed content bounds from a previous zoom of %s", previousZoom => {
    reader = mountCanvasReader()!
    const viewer = reader.viewer as CanvasViewer & {camera: {x: number, y: number, zoom: number}, items(): Element[]}
    viewer.camera = {x: 120, y: -80, zoom: previousZoom}
    const slot = document.body.shadowRoot!.querySelector("slot")!
    vi.spyOn(slot, "getBoundingClientRect").mockImplementation(() => ({left: viewer.camera.x, top: viewer.camera.y} as DOMRect))
    const shapes = [{left: -400, top: -200, right: 1600, bottom: 100}, {left: 200, top: 300, right: 600, bottom: 800}]
    const authored = document.body.innerHTML
    for(const [index, item] of viewer.items().entries()) {
      const shape = shapes[index]
      vi.spyOn(item, "getBoundingClientRect").mockImplementation(() => ({
        left: viewer.camera.x + shape.left * viewer.zoom, top: viewer.camera.y + shape.top * viewer.zoom,
        right: viewer.camera.x + shape.right * viewer.zoom, bottom: viewer.camera.y + shape.bottom * viewer.zoom,
      } as DOMRect))
    }
    control("fit-content").click()
    const rects = viewer.items().map(item => item.getBoundingClientRect())
    const left = Math.min(...rects.map(rect => rect.left)), right = Math.max(...rects.map(rect => rect.right))
    const top = Math.min(...rects.map(rect => rect.top)), bottom = Math.max(...rects.map(rect => rect.bottom))
    expect((left + right) / 2).toBeCloseTo(window.innerWidth / 2)
    expect((top + bottom) / 2).toBeCloseTo(window.innerHeight / 2)
    expect(viewer.zoom).toBeLessThan(1)
    expect(document.body.innerHTML).toBe(authored)
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
    expect(hasPresentationState(document.documentElement, "canvas-active")).toBe(true)
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
      expect(script?.getAttribute("blocking")).toBe("render")
      expect(script.hasAttribute("src")).toBe(false)
      const [imports] = await parse(script.textContent!)
      expect(imports).toHaveLength(0)
      // Execute the exact serialized source after removing only module export
      // declarations. It must not depend on Vite or any editor globals.
      editor.destroy(); editor = undefined
      document.designMode = "off"
      new Function(script.textContent!.replace(/^export /gm, ""))()
      expect(document.body.shadowRoot!.querySelector("[part=canvas-controls]")).not.toBeNull()
      expect(control("minimap-toggle").getAttribute("aria-expanded")).toBe("true")
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
