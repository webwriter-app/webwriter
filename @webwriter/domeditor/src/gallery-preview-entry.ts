import "./preview-entry"
import {cloneInert} from "./utility"
import {clearEditorArtifacts, isAuthoredMutation, widgetLookupForTags} from "./editor-artifacts"
import {reconcileExampleContent} from "./example-content"
import {sanitizePackageSnippet} from "./packages"

const bridge = document.querySelector<HTMLMetaElement>('meta[name="webwriter-preview-bridge"]')
const hostOrigin = bridge?.getAttribute("data-host-origin")
const bridgeNonce = bridge?.getAttribute("data-nonce")
const tag = new URL(import.meta.url).searchParams.get("tag")
const tags = new URL(import.meta.url).searchParams.get("tags")?.split(",").filter(Boolean) ?? (tag ? [tag] : [])
const networkVersion = new URL(import.meta.url).searchParams.get("network-version")
const slidesVersion = new URL(import.meta.url).searchParams.get("slides-version")
const hashVersion = new URL(import.meta.url).searchParams.get("hash-version")
const modelVersion = new URL(import.meta.url).searchParams.get("model-version")

/** Network 2.0.7 updates an author-only select even when rendering a learner. */
export function prepareGalleryNetwork(registry: CustomElementRegistry, version: string | null) {
  if(version !== "2.0.7") return
  const constructor = registry.get("ww-network")
  if(!constructor) return
  const prototype = constructor.prototype as HTMLElement & {renderRoot: ShadowRoot, updated(changes: Map<PropertyKey, unknown>): unknown}
  const updated = prototype.updated
  prototype.updated = function(changes) {
    if(!this.isContentEditable && !this.renderRoot.querySelector("#current-subnet-mode") && changes.has("automate")) {
      changes = new Map(changes)
      changes.delete("automate")
    }
    return updated.call(this, changes)
  }
}

/** Slides 2.3.1 clones live widget internals when regenerating navigation thumbnails. */
export function prepareGallerySlides(source: ParentNode, version: string | null) {
  if(version !== "2.3.1") return
  for(const widget of source.querySelectorAll<HTMLElement & {changeSlide: (index: number) => Promise<void>, activeSlideIndex: number, updateComplete: Promise<unknown>}>("webwriter-slides")) {
    const changeSlide = widget.changeSlide.bind(widget)
    widget.changeSlide = async index => {
      const slide = widget.querySelectorAll(":scope > webwriter-slide")[index]
      const hasWidget = slide && [...slide.querySelectorAll("*")].some(element => element.localName.includes("-"))
      if(!hasWidget) return changeSlide(index)
      // Keep the publisher's existing thumbnail; switching still uses its normal state.
      widget.activeSlideIndex = index
      await widget.updateComplete
      widget.shadowRoot?.querySelector(".active")?.scrollIntoView({block: "nearest", inline: "nearest"})
    }
  }
}

/** Fit the published video's complete picture and controls inside the gallery. */
export async function fitGalleryVideos(source: Document) {
  for(const widget of source.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>}>("webwriter-interactive-video")) {
    await widget.updateComplete
    const root = widget.shadowRoot
    if(!root?.querySelector("#widget")) continue
    const player = root.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>("video-player")
    await player?.updateComplete
    const video = player?.shadowRoot?.querySelector("video")
    const style = source.createElement("style")
    const fit = () => {
      const ratio = video?.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
      style.textContent = `:host {display: block; inline-size: min(100%, calc((100dvh - 10rem) * ${ratio})); margin-inline: auto} #widget:not(.fullscreen), #widget:not(.fullscreen) #container-vertical {height: auto; overflow: visible} #widget:not(.fullscreen) #container-video-area {flex: none}`
    }
    root.append(style)
    fit()
    video?.addEventListener("loadedmetadata", fit, {once: true})
  }
}

/** Some publisher thumbnails have expired, while their original image is available. */
export function recoverGalleryImages(source: Document) {
  for(const image of source.querySelectorAll("img")) {
    const recover = () => {
      const url = new URL(image.src, source.baseURI)
      const match = url.pathname.match(/^\/wikipedia\/(commons|[a-z-]+)\/thumb\/([a-f0-9]\/[^/]+\/[^/]+)\/[^/]+$/)
      if(url.origin !== "https://upload.wikimedia.org" || !match) return
      const width = url.pathname.split("/").at(-1)?.match(/^(\d+)px-/)?.[1]
      if(width && !image.hasAttribute("width")) image.width = Number(width)
      url.pathname = `/wikipedia/${match[1]}/${match[2]}`
      image.src = url.href
    }
    if(image.complete && !image.naturalWidth) recover()
    else image.addEventListener("error", recover, {once: true})
  }
}

/** Published snippets save a pan position for the author's canvas size. */
export async function fitGalleryFlowcharts(source: Document) {
  const observers: ResizeObserver[] = []
  for(const widget of source.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>, requestUpdate?: (name: string, oldValue: unknown) => void, graphNodes: {x: number, y: number, text: string}[], zoomLevel: number, canvasOffsetX: number, canvasOffsetY: number}>("webwriter-flowchart")) {
    await widget.updateComplete
    const canvas = widget.shadowRoot?.querySelector("canvas")
    const context = canvas?.getContext("2d")
    if(!canvas || !context || !widget.graphNodes?.length) continue
    const font = context.font
    const fontSize = Number.parseFloat(font.match(/\d+(?:\.\d+)?px/)?.[0] ?? "16")
    const nodes = widget.graphNodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y))
    if(!nodes.length) continue
    const left = Math.min(...nodes.map(node => node.x))
    const top = Math.min(...nodes.map(node => node.y))
    const right = Math.max(...nodes.map(node => node.x + (node.text ? context.measureText(node.text).width + 60 : 30)))
    const bottom = Math.max(...nodes.map(node => node.y + (node.text ? fontSize + 30 : 30)))
    let previousSize = ""
    const fit = () => {
      const {width, height} = canvas.getBoundingClientRect()
      const leftInset = widget.shadowRoot?.querySelector(".action-menu")?.getBoundingClientRect().width ?? 0
      const availableWidth = width - leftInset
      const menuHeight = widget.shadowRoot?.querySelector(".flowchart-menu")?.getBoundingClientRect().height ?? 0
      const availableHeight = height - menuHeight
      const size = `${availableWidth},${availableHeight}`
      if(availableWidth <= 0 || availableHeight <= 0 || size === previousSize) return
      previousSize = size
      const scale = Math.min(1, (availableWidth - 48) / (right - left), (availableHeight - 48) / (bottom - top))
      if(scale <= 0) return
      widget.canvasOffsetX = (leftInset + availableWidth / 2) / scale - (left + right) / 2
      widget.canvasOffsetY = availableHeight / (2 * scale) - (top + bottom) / 2
      widget.zoomLevel = scale * 100
      widget.requestUpdate?.("zoomLevel", NaN)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    observers.push(observer)
  }
  return () => observers.forEach(observer => observer.disconnect())
}

/** Model 1.0.2 imports off-screen nodes; fit its Drawflow camera without moving nodes. */
export async function fitGalleryModels(source: Document, version: string | null) {
  const cleanups: (() => void)[] = []
  type Camera = {zoom: number, zoom_last_value: number, canvas_x: number, canvas_y: number, zoom_refresh: () => void}
  if(version === "1.0.2") for(const widget of source.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>}>("webwriter-model-designing")) {
    await widget.updateComplete
    const editor = widget.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>, controler?: {editor?: Camera}}>("model-editor")
    await editor?.updateComplete
    const root = editor?.shadowRoot
    if(!root) continue
    let previousSize = ""
    const fit = () => {
      const canvas = root.querySelector("#drawflow")
      const nodes = [...root.querySelectorAll(".drawflow-node")]
      const bounds = canvas?.getBoundingClientRect()
      const camera = editor?.controler?.editor
      if(!bounds?.width || !nodes.length || !camera?.zoom_refresh) return
      const size = `${bounds.width},${bounds.height},${nodes.length},${root.querySelectorAll(".connection").length}`
      if(size === previousSize) return
      previousSize = size
      // Drawflow's coordinate math expects its canvas origin at the top left.
      const plane = root.querySelector<HTMLElement>(".drawflow")
      if(plane) plane.style.transformOrigin = "0 0"
      camera.zoom = camera.zoom_last_value = 1
      camera.canvas_x = camera.canvas_y = 0
      camera.zoom_refresh()
      const boxes = nodes.map(node => node.getBoundingClientRect())
      const left = Math.min(...boxes.map(box => box.left)) - bounds.left
      const top = Math.min(...boxes.map(box => box.top)) - bounds.top
      const width = Math.max(...boxes.map(box => box.right)) - bounds.left - left
      const height = Math.max(...boxes.map(box => box.bottom)) - bounds.top - top
      const scale = Math.min(1, (bounds.width - 48) / width, (bounds.height - 96) / height)
      if(!Number.isFinite(scale) || scale <= 0) return
      camera.zoom = camera.zoom_last_value = scale
      camera.canvas_x = (bounds.width - width * scale) / 2 - left * scale
      camera.canvas_y = 48 + (bounds.height - 96 - height * scale) / 2 - top * scale
      camera.zoom_refresh()
    }
    const mutations = new MutationObserver(fit)
    const resize = new ResizeObserver(fit)
    mutations.observe(root, {subtree: true, childList: true})
    resize.observe(editor!)
    fit()
    cleanups.push(() => {mutations.disconnect(); resize.disconnect()})
  }
  return () => cleanups.forEach(cleanup => cleanup())
}

/** Hash 1.0.2 fits once while hidden; reuse its own focus control upon reveal. */
export async function fitGalleryHiddenHashes(source: Document, version: string | null) {
  const observers: ResizeObserver[] = []
  if(version === "1.0.2") for(const widget of source.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>}>("webwriter-slide webwriter-hash")) {
    await widget.updateComplete
    let previousWidth = 0
    const observer = new ResizeObserver(() => {
      const width = widget.getBoundingClientRect().width
      if(width > 0 && width !== previousWidth) {
        widget.shadowRoot?.querySelector<HTMLElement>('.pill-right sl-tooltip[content="Focus on nodes"] sl-icon')?.click()
      }
      previousWidth = width
    })
    observer.observe(widget)
    observers.push(observer)
  }
  return () => observers.forEach(observer => observer.disconnect())
}

/** Upgrade nested widgets while detached, before a parent reads their state. */
export async function connectGalleryContent(source: Document, tags: string[], registry = customElements, networkVersion: string | null = null, slidesVersion: string | null = null) {
  await Promise.all(tags.map(tag => registry.whenDefined(tag)))
  prepareGalleryNetwork(registry, networkVersion)
  const template = source.querySelector<HTMLTemplateElement>("body > template#webwriter-gallery-content")
  if(!template) return
  const content = source.createDocumentFragment()
  content.append(template.content)
  registry.upgrade(content)
  prepareGallerySlides(content, slidesVersion)
  template.replaceWith(content)
  await Promise.all(tags.flatMap(tag => [...source.getElementsByTagName(tag)].map(widget => (widget as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete)))
}

/** Keep long published lessons intact, but reveal the widget chosen in the menu. */
export async function revealGalleryWidget(source: Document, tag: string | null) {
  if(!tag) return
  const widget = source.getElementsByTagName(tag)[0] as (HTMLElement & {updateComplete?: Promise<unknown>}) | undefined
  if(!widget) return
  await widget.updateComplete
  const view = source.defaultView
  if(view && widget.getBoundingClientRect().top > view.innerHeight / 2) {
    view.scrollTo({top: view.scrollY + widget.getBoundingClientRect().top - 24})
  }
}

function connectGalleryModes(post: (detail: object) => void, signal: AbortSignal) {
  const root = document.body
  const widgetLookup = widgetLookupForTags(tags)
  const dataSelector = 'script[slot="data"]:is([type="application/json"], [type="application/xml"]):not([src])'
  const blocks = () => new Map([...root.querySelectorAll<HTMLScriptElement>(dataSelector)].flatMap((block, index) => {
    const widget = block.parentElement
    if(!widget || !widgetLookup(widget) || widget.querySelector(':scope > script[slot="data"]') !== block) return []
    const shared = widget.getAttribute("shared")
    const mode = shared === "group" ? "group" : shared === "" ? "all" : "individual"
    return [[JSON.stringify([widget.localName, widget.id || index, shared]), {block, mode}] as const]
  }))
  let editing = false, shared = false, revision = 0
  let controller: ReturnType<typeof import("../dev-server/live-example-editing").mount> | undefined
  let lastHTML: string | undefined, lastEditableHTML: string | undefined
  let lastData = new Map<string, string>()
  const snapshot = () => {
    const clone = cloneInert(root, true)
    clearEditorArtifacts(clone, [], () => false)
    const editableHTML = editing ? sanitizePackageSnippet(clone.innerHTML) : undefined
    clearEditorArtifacts(clone, [], widgetLookup)
    return {html: sanitizePackageSnippet(clone.innerHTML), editableHTML}
  }
  const publishHTML = (local: boolean, force = false) => {
    const {html, editableHTML} = snapshot()
    if(!force && html === lastHTML && editableHTML === lastEditableHTML) return
    lastHTML = html
    lastEditableHTML = editableHTML
    post({type: "gallery-preview-html", html, editableHTML, editing, shared, local})
  }
  const notify = (block: HTMLScriptElement, mode: string) =>
    block.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode}}))
  const observe = () => observer.observe(root, {subtree: true, childList: true, characterData: true, characterDataOldValue: true,
    attributes: true, attributeOldValue: true})
  const publishData = (all = false) => {
    const current = new Map<string, string>()
    const changes: [string, string][] = []
    for(const [key, {block, mode}] of blocks()) {
      if(mode === "individual") continue
      const value = block.textContent ?? ""
      current.set(key, value)
      const changed = value !== lastData.get(key)
      if(changed) notify(block, mode)
      if((all || changed) && key.length < 1024 && value.length <= 250_000) changes.push([key, value])
    }
    lastData = current
    if(changes.length) post({type: "gallery-preview-data", changes: changes.slice(0, 128)})
  }
  const observer = new MutationObserver(records => {
    if(!editing && shared) publishData()
    if(records.some(record => isAuthoredMutation(record) || editing && record.attributeName === "contenteditable")) {
      publishHTML(true)
    }
  })
  root.addEventListener("datarequest", event => {
    if(editing || !shared) return
    for(const {block, mode} of blocks().values()) if(block === event.target && mode !== "individual") {
      event.preventDefault()
      notify(block, mode)
      break
    }
  }, {signal})
  window.addEventListener("message", async event => {
    const data = event.data
    if(event.source !== parent || event.origin !== hostOrigin || data?.bridgeNonce !== bridgeNonce) return
    if(data.type === "gallery-preview-configure" && typeof data.editing === "boolean" && typeof data.shared === "boolean") {
      observe()
      if(data.editing === editing && data.shared === shared && (!editing || controller)) {
        publishHTML(false, true)
        return
      }
      const wasSharedReading = shared && !editing
      const modeChanged = data.editing !== editing
      const request = ++revision
      editing = data.editing
      shared = data.shared
      if(wasSharedReading && (!shared || editing)) {
        for(const {block, mode} of blocks().values()) if(mode !== "individual") {
          block.dispatchEvent(new CustomEvent("datarelease", {bubbles: true}))
        }
      }
      if(modeChanged && !editing) {
        controller?.destroy()
        controller = undefined
      }
      if(editing && !controller) {
        try {
          const {mount} = await import("../dev-server/live-example-editing")
          if(signal.aborted || request !== revision || !editing) return
          controller = mount(root, widgetLookup)
        }
        catch(error) { if(request === revision) post({type: "gallery-preview-error", message: String(error)}) }
      }
      if(!editing && shared && !wasSharedReading) {
        lastData = new Map()
        for(const {block, mode} of blocks().values()) if(mode !== "individual") notify(block, mode)
        for(const [key, {block, mode}] of blocks()) if(mode !== "individual") lastData.set(key, block.textContent ?? "")
      }
      publishHTML(false, true)
    }
    else if(data.type === "gallery-preview-html" && typeof data.html === "string" && data.html.length <= 50_000_000) {
      const template = document.createElement("template")
      template.innerHTML = sanitizePackageSnippet(data.html)
      // Report the result to the HTML pane without relaying it back to the sender.
      observer.disconnect()
      reconcileExampleContent(root, [...template.content.childNodes])
      controller?.refresh(true)
      publishHTML(false)
      observe()
    }
    else if(!editing && shared && data.type === "gallery-preview-data-request") publishData(true)
    else if(!editing && shared && data.type === "gallery-preview-data" && Array.isArray(data.changes)) {
      const current = blocks()
      for(const item of data.changes.slice(0, 128)) {
        if(!Array.isArray(item) || typeof item[0] !== "string" || typeof item[1] !== "string" || item[1].length > 250_000) continue
        const target = current.get(item[0])
        if(!target || target.mode === "individual" || target.block.textContent === item[1]) continue
        target.block.textContent = item[1]
        lastData.set(item[0], item[1])
        notify(target.block, target.mode)
      }
    }
  }, {signal})
  signal.addEventListener("abort", () => {
    observer.disconnect()
    controller?.destroy()
  }, {once: true})
}

if(hostOrigin && bridgeNonce && window.parent !== window) {
  const post = (detail: object) => window.parent.postMessage({...detail, bridgeNonce}, hostOrigin)
  const fail = (message: string) => post({type: "gallery-preview-error", message})
  const error = (event: ErrorEvent | Event) => {
    if(event instanceof ErrorEvent && event.error == null && event.lineno === 0 && event.colno === 0
      && /^ResizeObserver loop (?:completed with undelivered notifications\.|limit exceeded)$/.test(event.message)) return
    if(event instanceof ErrorEvent) fail(event.message)
    else if(event.target instanceof HTMLScriptElement) fail("A widget script could not be loaded.")
  }
  const rejection = (event: PromiseRejectionEvent) => fail(String(event.reason?.message ?? event.reason))
  window.addEventListener("error", error, true)
  window.addEventListener("unhandledrejection", rejection)
  const observer = new ResizeObserver(() => {
    const height = Math.ceil(document.body.getBoundingClientRect().height)
    post({type: "gallery-preview-height", height})
  })
  observer.observe(document.body)
  const ready = () => post({type: "gallery-preview-ready"})
  const lifetime = new AbortController()
  const fittingCleanups: (() => void)[] = []
  void connectGalleryContent(document, tags, customElements, networkVersion, slidesVersion).then(async () => {
    recoverGalleryImages(document)
    await fitGalleryVideos(document)
    fittingCleanups.push(await fitGalleryFlowcharts(document))
    fittingCleanups.push(await fitGalleryModels(document, modelVersion))
    fittingCleanups.push(await fitGalleryHiddenHashes(document, hashVersion))
    await revealGalleryWidget(document, tag)
  }).then(() => {
    if(!lifetime.signal.aborted) {
      connectGalleryModes(post, lifetime.signal)
      ready()
    }
  }).catch(error => fail(String(error)))
  window.addEventListener("pagehide", () => {
    lifetime.abort()
    fittingCleanups.forEach(cleanup => cleanup())
    observer.disconnect()
    window.removeEventListener("error", error, true)
    window.removeEventListener("unhandledrejection", rejection)
  }, {once: true})
}
