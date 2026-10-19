// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
vi.mock("./preview-entry", () => ({}))
import {connectGalleryContent, fitGalleryFlowcharts, fitGalleryHiddenHashes, fitGalleryModels, fitGalleryVideos, prepareGalleryNetwork, prepareGallerySlides, recoverGalleryImages} from "./gallery-preview-entry"

afterEach(() => {document.body.replaceChildren(); vi.unstubAllGlobals()})

it("waits for every widget definition and upgrades detached content before connecting parents", async () => {
  document.body.innerHTML = '<template id="webwriter-gallery-content"><parent-widget><!--keep--><child-widget date="1815"><script type="application/json">{"answer":42}</script><x-unfamiliar>Title</x-unfamiliar></child-widget></parent-widget></template>'
  const template = document.querySelector("template")!
  const parent = template.content.firstElementChild!
  const child = parent.querySelector("child-widget")!
  const waiting = new Map<string, () => void>()
  const registry = {
    whenDefined: vi.fn((tag: string) => new Promise<void>(resolve => waiting.set(tag, resolve))),
    upgrade: vi.fn((content: DocumentFragment) => {
      expect(parent.isConnected).toBe(false)
      expect(content.firstElementChild).toBe(parent)
      expect(child.getAttribute("date")).toBe("1815")
    }),
  } as unknown as CustomElementRegistry
  const connected = connectGalleryContent(document, ["parent-widget", "child-widget"], registry)
  waiting.get("parent-widget")!()
  await Promise.resolve()
  expect(parent.isConnected).toBe(false)
  waiting.get("child-widget")!()
  await connected
  expect(registry.upgrade).toHaveBeenCalledOnce()
  expect(parent.isConnected).toBe(true)
  expect(document.querySelector("template")).toBeNull()
  expect(document.body.firstElementChild).toBe(parent)
  expect(child.querySelector("script")?.textContent).toBe('{"answer":42}')
  expect(child.querySelector("x-unfamiliar")?.textContent).toBe("Title")
  expect(parent.innerHTML).toContain("<!--keep-->")
})

it("connects snippet-only media without waiting for a custom element", async () => {
  document.body.innerHTML = '<template id="webwriter-gallery-content"><iframe title="Simulation" src="https://example.test/simulation"></iframe></template>'
  await connectGalleryContent(document, [])
  expect(document.querySelector("template")).toBeNull()
  expect(document.body.firstElementChild?.localName).toBe("iframe")
})

it("avoids the Network 2.0.7 author-only update without swallowing learner updates", () => {
  const updated = vi.fn()
  class Network extends HTMLElement {
    renderRoot = this.attachShadow({mode: "open"})
    updated = updated
  }
  // Lit defines its lifecycle method on the prototype.
  Network.prototype.updated = updated
  const get = vi.fn((tag: string) => tag === "ww-network" ? Network : undefined)
  const registry = {get} as unknown as CustomElementRegistry
  prepareGalleryNetwork(registry, "2.0.8")
  expect(Network.prototype.updated).toBe(updated)
  prepareGalleryNetwork(registry, "2.0.7")
  expect(get).toHaveBeenCalledWith("ww-network")
  const learner = {isContentEditable: false, renderRoot: document.createElement("div")} as unknown as Network
  const changes = new Map<string, unknown>([["automate", false], ["nodes", []]])
  Network.prototype.updated.call(learner, changes)
  expect(updated).toHaveBeenLastCalledWith(new Map([["nodes", []]]))
  expect(changes.has("automate")).toBe(true)
  learner.renderRoot.innerHTML = '<select id="current-subnet-mode"></select>'
  Network.prototype.updated.call(learner, changes)
  expect(updated).toHaveBeenLastCalledWith(changes)
})

it("fits video presentation to its real aspect ratio and preserves fullscreen styling", async () => {
  const widget = document.createElement("webwriter-interactive-video")
  const root = widget.attachShadow({mode: "open"})
  root.innerHTML = '<div id="widget"><video-player></video-player></div>'
  const player = root.querySelector("video-player")!
  const playerRoot = player.attachShadow({mode: "open"})
  const video = document.createElement("video")
  playerRoot.append(video)
  document.body.append(widget)
  await fitGalleryVideos(document)
  const style = root.querySelector("style")!
  expect(style.textContent).toContain(String(16 / 9))
  Object.defineProperties(video, {videoWidth: {value: 640}, videoHeight: {value: 480}})
  video.dispatchEvent(new Event("loadedmetadata"))
  expect(style.textContent).toContain(String(4 / 3))
  expect(style.textContent).toContain("#widget:not(.fullscreen)")
  expect(document.body.querySelector("style")).toBeNull()
})

it("centers saved flowchart coordinates within the actual canvas without changing the graph", async () => {
  const widget = document.createElement("webwriter-flowchart") as HTMLElement & {graphNodes: {x: number, y: number, text: string}[], zoomLevel: number, canvasOffsetX: number, canvasOffsetY: number}
  widget.graphNodes = [{x: 500, y: 50, text: "Start"}, {x: 800, y: 550, text: "End"}]
  const nodes = JSON.stringify(widget.graphNodes)
  const canvas = document.createElement("canvas")
  canvas.getContext = vi.fn().mockReturnValue({font: "16px Arial", measureText: () => ({width: 40})})
  canvas.getBoundingClientRect = () => ({width: 1000, height: 400}) as DOMRect
  const menu = document.createElement("div")
  menu.className = "flowchart-menu"
  menu.getBoundingClientRect = () => ({height: 80}) as DOMRect
  widget.attachShadow({mode: "open"}).append(canvas, menu)
  document.body.append(widget)
  const stop = await fitGalleryFlowcharts(document)
  const scale = widget.zoomLevel / 100
  expect((500 + widget.canvasOffsetX) * scale).toBeGreaterThan(24)
  expect((900 + widget.canvasOffsetX) * scale).toBeLessThan(976)
  expect((50 + widget.canvasOffsetY) * scale).toBeCloseTo(24)
  expect((596 + widget.canvasOffsetY) * scale).toBeCloseTo(296)
  expect(JSON.stringify(widget.graphNodes)).toBe(nodes)
  stop()
})

it("switches nested-widget slides without cloning their runtime state into thumbnails", async () => {
  const widget = document.createElement("webwriter-slides") as HTMLElement & {changeSlide: (index: number) => Promise<void>, activeSlideIndex: number, updateComplete: Promise<unknown>}
  widget.innerHTML = '<webwriter-slide><p>Introduction</p></webwriter-slide><webwriter-slide thumbnail="published.webp"><webwriter-hash></webwriter-hash></webwriter-slide>'
  widget.updateComplete = Promise.resolve()
  const changeSlide = vi.fn(async (_index: number) => {})
  widget.changeSlide = changeSlide
  document.body.append(widget)
  prepareGallerySlides(document, "2.3.2")
  expect(widget.changeSlide).toBe(changeSlide)
  prepareGallerySlides(document, "2.3.1")
  await widget.changeSlide(0)
  expect(changeSlide).toHaveBeenCalledExactlyOnceWith(0)
  await widget.changeSlide(1)
  expect(widget.activeSlideIndex).toBe(1)
  expect(changeSlide).toHaveBeenCalledOnce()
  expect(widget.querySelectorAll("webwriter-slide")[1].getAttribute("thumbnail")).toBe("published.webp")
})

it("recovers only failed Wikimedia thumbnails using the same original image", () => {
  document.body.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Roman_Boys_at_School.png/320px-Roman_Boys_at_School.png"><img src="https://example.test/wikipedia/commons/thumb/7/7c/file.png/320px-file.png">'
  recoverGalleryImages(document)
  const [image, other] = [...document.querySelectorAll("img")]
  image.dispatchEvent(new Event("error"))
  other.dispatchEvent(new Event("error"))
  expect(image.src).toBe("https://upload.wikimedia.org/wikipedia/commons/7/7c/Roman_Boys_at_School.png")
  expect(image.width).toBe(320)
  expect(other.src).toBe("https://example.test/wikipedia/commons/thumb/7/7c/file.png/320px-file.png")
})

it("fits the model camera without changing saved node positions", async () => {
  const widget = document.createElement("webwriter-model-designing")
  const camera = {zoom: 1, zoom_last_value: 1, canvas_x: 0, canvas_y: 0, zoom_refresh: vi.fn()}
  const editor = document.createElement("model-editor")
  Object.assign(editor, {controler: {editor: camera}})
  const root = editor.attachShadow({mode: "open"})
  root.innerHTML = '<div id="drawflow" class="drawflow"><div class="drawflow-node"></div></div>'
  root.querySelector("#drawflow")!.getBoundingClientRect = () => ({left: 0, right: 600, top: 0, bottom: 400, width: 600, height: 400}) as DOMRect
  root.querySelector(".drawflow-node")!.getBoundingClientRect = () => ({left: camera.canvas_x, right: camera.canvas_x + 1000 * camera.zoom, top: camera.canvas_y, bottom: camera.canvas_y + 200 * camera.zoom}) as DOMRect
  widget.attachShadow({mode: "open"}).append(editor)
  document.body.append(widget)
  const stop = await fitGalleryModels(document, "1.0.2")
  expect(camera.zoom_refresh).toHaveBeenCalledTimes(2)
  expect(camera.canvas_x).toBe(24)
  expect(root.querySelector<HTMLElement>(".drawflow")!.style.transformOrigin).toBe("0 0")
  expect(camera.canvas_x + 1000 * camera.zoom).toBeLessThanOrEqual(588)
  expect(root.querySelector(".drawflow-node")!.attributes.length).toBe(1)
  stop()
})

it("refocuses a nested hash when it becomes visible and disconnects on cleanup", async () => {
  let resize!: ResizeObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) {resize = callback}
    observe() {}
    disconnect = disconnect
  })
  const slide = document.createElement("webwriter-slide")
  const widget = document.createElement("webwriter-hash")
  const root = widget.attachShadow({mode: "open"})
  root.innerHTML = '<div class="pill-right"><sl-tooltip content="Focus on nodes"><sl-icon></sl-icon></sl-tooltip></div>'
  const focus = vi.fn()
  root.querySelector("sl-icon")!.addEventListener("click", focus)
  let width = 0
  widget.getBoundingClientRect = () => ({width}) as DOMRect
  slide.append(widget)
  document.body.append(slide)
  const stop = await fitGalleryHiddenHashes(document, "1.0.2")
  resize([], {} as ResizeObserver)
  expect(focus).not.toHaveBeenCalled()
  width = 600
  resize([], {} as ResizeObserver)
  resize([], {} as ResizeObserver)
  expect(focus).toHaveBeenCalledOnce()
  stop()
  expect(disconnect).toHaveBeenCalledOnce()
})
