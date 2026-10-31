export const mediaTypes = ["picture", "img", "audio", "video", "iframe", "embed", "object"] as const

export type MediaType = typeof mediaTypes[number]

/** Percentage insets editable by both crop fields and transform handles. */
export function mediaCropInsets(value: string): number[] | null {
  if(!value || value.trim() === "none") return [0, 0, 0, 0]
  const match = value.trim().match(/^inset\(\s*([^()]+?)\s*\)$/)
  const parts = match?.[1].split(/\s+/)
  if(!parts || parts.length > 4 || !parts.every(part => /^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(part) || part === "0")) return null
  const values = parts.map(part => parseFloat(part))
  const edges = [values[0], values[1] ?? values[0], values[2] ?? values[0], values[3] ?? values[1] ?? values[0]]
  return edges.every(value => value >= 0 && value < 100) && edges[0] + edges[2] < 100 && edges[1] + edges[3] < 100 ? edges : null
}

export const mediaCaptureModes = {
  "screen-image": {media: "picture", label: "Capture screenshot"},
  "camera-image": {media: "picture", label: "Take photo"},
  "screen-audio": {media: "audio", label: "Record screen audio"},
  "microphone-audio": {media: "audio", label: "Record microphone"},
  "screen-video": {media: "video", label: "Record screen"},
  "camera-video": {media: "video", label: "Record camera"},
} as const

export type MediaCaptureMode = keyof typeof mediaCaptureModes

export const isMediaCaptureMode = (value: unknown): value is MediaCaptureMode => (
  typeof value === "string" && Object.hasOwn(mediaCaptureModes, value)
)

export const mediaCaptureOptions = (media: MediaType) => (
  (Object.keys(mediaCaptureModes) as MediaCaptureMode[])
    .filter(mode => mediaCaptureModes[mode].media === (media === "img" ? "picture" : media))
    .map(mode => ({mode, label: mode.startsWith("screen-") ? "Capture screen" : "Record"}))
)

export const websiteTypes = ["iframe", "embed", "object"] as const

export type WebsiteType = typeof websiteTypes[number]

/** Website URL entry must agree with the document frame's HTTPS policy. */
export function websiteSourceError(value: string) {
  if(!value) return ""
  try {
    const url = new URL(value)
    if(url.protocol === "https:" && !url.username && !url.password) return ""
  }
  catch {}
  return "Enter a valid https:// website URL."
}

export const mediaElementSelector = mediaTypes.join(", ")

export const timedMediaResourceTypes = ["source", "track"] as const

export type TimedMediaResourceType = typeof timedMediaResourceTypes[number]

export type TimedMediaResourceState = {
  /** Current direct child-node offset. Commands fail safely if it is stale. */
  index: number
  attributes: Record<string, string>
  sourceLabel?: string
  sourceKind?: "file" | "capture" | "recording"
}

export const imageMapHotspotShapes = ["rect", "circle", "poly"] as const

export type ImageMapHotspotShape = typeof imageMapHotspotShapes[number]

export type ImageMapAreaState = {
  /** Current child-node path from MAP. Commands fail safely if it is stale. */
  path: number[]
  attributes: Record<string, string>
}

export type ImageMapSelectionState = {
  name: string
  /** True when another authored image also refers to this map. */
  shared: boolean
  areas: ImageMapAreaState[]
}

export type MediaSelectionState = {
  type: MediaType
  attributes: Record<string, string>
  /** Whether the selected image has a source, including picture source candidates. */
  hasSource?: boolean
  sourceSize?: number
  sourceLabel?: string
  sourceKind?: "file" | "capture" | "recording"
  cover?: {label?: string, kind?: "file" | "capture" | "recording", size?: number}
  /** Local browser playback status; never part of the authored document. */
  videoPlaybackWarning?: "unsupported" | "no-video"
  /** Direct child resources, present only for AUDIO and VIDEO. */
  sources?: TimedMediaResourceState[]
  tracks?: TimedMediaResourceState[]
  /** Authored non-resource children, serialized without editing artifacts. */
  fallbackHTML?: string
  /** Present for images; null means the image has no associated authored map. */
  imageMap?: ImageMapSelectionState | null
}

export type MediaAttributeOption = {
  name: string
  label: string
  kind?: "text" | "url" | "number" | "boolean" | "select"
  placeholder?: string
  options?: Array<{label: string, value: string}>
}

export const timedMediaResourceAttributeOptions: Record<TimedMediaResourceType, MediaAttributeOption[]> = {
  source: [
    {name: "src", label: "Source URL", kind: "url", placeholder: "https://…"},
    {name: "type", label: "MIME type", placeholder: "video/mp4"},
    {name: "media", label: "Media query", placeholder: "(min-width: 800px)"},
  ],
  track: [
    {name: "kind", label: "Kind", kind: "select", options: [
      {label: "Subtitles", value: "subtitles"},
      {label: "Captions", value: "captions"},
      {label: "Descriptions", value: "descriptions"},
      {label: "Chapters", value: "chapters"},
      {label: "Metadata", value: "metadata"},
    ]},
    {name: "srclang", label: "Language", placeholder: "en"},
    {name: "label", label: "Label", placeholder: "English"},
    {name: "src", label: "Track URL", kind: "url", placeholder: "captions.vtt"},
    {name: "default", label: "Default", kind: "boolean"},
  ],
}

export const imageMapAreaAttributeOptions: MediaAttributeOption[] = [
  {name: "shape", label: "Shape", kind: "select", options: [
    {label: "Rectangle", value: "rect"},
    {label: "Circle", value: "circle"},
    {label: "Polygon", value: "poly"},
    {label: "Whole image", value: "default"},
  ]},
  {name: "coords", label: "Coordinates", placeholder: "0,0,100,100"},
  {name: "href", label: "Link URL", kind: "url", placeholder: "https://…"},
]

const imageAttributes: MediaAttributeOption[] = [
  {name: "src", label: "Source URL", kind: "url", placeholder: "https://…"},
  {name: "alt", label: "Alternative text", placeholder: "Describe the image"},
  {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
  {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
  {name: "loading", label: "Loading", kind: "select", options: [
    {label: "Browser default", value: ""},
    {label: "Lazy", value: "lazy"},
    {label: "Eager", value: "eager"},
  ]},
  {name: "decoding", label: "Decoding", kind: "select", options: [
    {label: "Browser default", value: ""},
    {label: "Auto", value: "auto"},
    {label: "Async", value: "async"},
    {label: "Sync", value: "sync"},
  ]},
  {name: "crossorigin", label: "Cross-origin", kind: "select", options: [
    {label: "Not set", value: ""},
    {label: "Anonymous", value: "anonymous"},
    {label: "Use credentials", value: "use-credentials"},
  ]},
  {name: "referrerpolicy", label: "Referrer policy", placeholder: "Browser default"},
  {name: "sizes", label: "Sizes", placeholder: "(max-width: 600px) 100vw"},
  {name: "srcset", label: "Source set", placeholder: "image-2x.png 2x"},
]

const timedMediaAttributes: MediaAttributeOption[] = [
  {name: "src", label: "Source URL", kind: "url", placeholder: "https://…"},
  {name: "autoplay", label: "Autoplay", kind: "boolean"},
  {name: "loop", label: "Loop", kind: "boolean"},
  {name: "muted", label: "Muted", kind: "boolean"},
  {name: "preload", label: "Preload", kind: "select", options: [
    {label: "Browser default", value: ""},
    {label: "None", value: "none"},
    {label: "Metadata", value: "metadata"},
    {label: "Auto", value: "auto"},
  ]},
  {name: "crossorigin", label: "Cross-origin", kind: "select", options: [
    {label: "Not set", value: ""},
    {label: "Anonymous", value: "anonymous"},
    {label: "Use credentials", value: "use-credentials"},
  ]},
]

export const mediaAttributeOptions: Record<MediaType, MediaAttributeOption[]> = {
  picture: imageAttributes,
  img: imageAttributes,
  audio: [...timedMediaAttributes, {name: "aria-label", label: "Alternative text", placeholder: "Describe the audio"}],
  video: [
    ...timedMediaAttributes,
    {name: "aria-label", label: "Alternative text", placeholder: "Describe the video"},
    {name: "poster", label: "Cover image", kind: "url", placeholder: "https://…"},
    {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
    {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
    {name: "playsinline", label: "Play inline", kind: "boolean"},
  ],
  iframe: [
    {name: "aria-label", label: "Alternative text", placeholder: "Describe the website"},
    {name: "src", label: "Source URL", kind: "url", placeholder: "https://…"},
    {name: "name", label: "Name", placeholder: "Embedded website"},
    {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
    {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
    {name: "loading", label: "Loading", kind: "select", options: [
      {label: "Browser default", value: ""},
      {label: "Lazy", value: "lazy"},
      {label: "Eager", value: "eager"},
    ]},
    {name: "sandbox", label: "Sandbox", placeholder: "allow-scripts allow-forms"},
    {name: "allow", label: "Permissions", placeholder: "fullscreen; clipboard-write"},
    {name: "referrerpolicy", label: "Referrer policy", placeholder: "Browser default"},
    {name: "allowfullscreen", label: "Allow fullscreen", kind: "boolean"},
  ],
  embed: [
    {name: "aria-label", label: "Alternative text", placeholder: "Describe the website"},
    {name: "allowfullscreen", label: "Allow fullscreen", kind: "boolean"},
    {name: "src", label: "Source URL", kind: "url", placeholder: "https://…"},
    {name: "type", label: "MIME type", placeholder: "text/html"},
    {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
    {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
  ],
  object: [
    {name: "aria-label", label: "Alternative text", placeholder: "Describe the website"},
    {name: "allowfullscreen", label: "Allow fullscreen", kind: "boolean"},
    {name: "data", label: "Data URL", kind: "url", placeholder: "https://…"},
    {name: "type", label: "MIME type", placeholder: "text/html"},
    {name: "name", label: "Name", placeholder: "Embedded website"},
    {name: "form", label: "Form ID", placeholder: "form-id"},
    {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
    {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
    {name: "usemap", label: "Image map", placeholder: "#map-name"},
  ],
}

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && (mediaTypes as readonly string[]).includes(value)
}

export function isWebsiteType(value: unknown): value is WebsiteType {
  return typeof value === "string" && (websiteTypes as readonly string[]).includes(value)
}

export function isTimedMediaResourceType(value: unknown): value is TimedMediaResourceType {
  return typeof value === "string" && (timedMediaResourceTypes as readonly string[]).includes(value)
}

export function isImageMapHotspotShape(value: unknown): value is ImageMapHotspotShape {
  return typeof value === "string" && (imageMapHotspotShapes as readonly string[]).includes(value)
}

export function mediaContainerForNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement
  const media = element?.closest(mediaElementSelector) ?? null
  return media?.matches("img") && media.parentElement?.matches("picture")
    ? media.parentElement
    : media
}

export function mediaDefaultHTML(type: MediaType) {
  switch(type) {
    case "picture": return "<picture><img></picture>"
    case "img": return "<img>"
    case "audio": return "<audio controls></audio>"
    case "video": return "<video controls></video>"
    case "iframe": return "<iframe></iframe>"
    case "embed": return "<embed>"
    case "object": return "<object></object>"
  }
}

export function mediaSourceAttribute(elementOrType: Element | MediaType) {
  const type = typeof elementOrType === "string" ? elementOrType : elementOrType.localName
  return type === "object" ? "data" : type === "image" && typeof elementOrType !== "string"
    && elementOrType.namespaceURI === "http://www.w3.org/2000/svg" ? "href" : "src"
}

export function mediaSourceTarget(element: Element, create = true) {
  if(element.matches("picture")) {
    let image = element.querySelector(":scope > img")
    if(!image && create) {
      image = document.createElement("img")
      element.append(image)
    }
    return image ?? element
  }
  return element
}

export function isEmptyMedia(element: Element) {
  if(element.namespaceURI === "http://www.w3.org/2000/svg" && element.localName === "image") {
    return !element.getAttribute("href")?.trim() && !element.getAttributeNS("http://www.w3.org/1999/xlink", "href")?.trim()
  }
  if(element.matches("picture")) {
    return !Array.from(element.querySelectorAll("img, source")).some(child => child.localName === "img"
      ? Boolean(child.getAttribute("src")?.trim() || child.getAttribute("srcset")?.trim())
      : Boolean(child.getAttribute("srcset")?.trim()))
  }
  if(element.matches("audio, video")) {
    return !element.getAttribute("src")?.trim()
      && !Array.from(element.querySelectorAll(":scope > source[src]")).some(source => source.getAttribute("src")?.trim())
  }
  if(element.matches("iframe") && element.getAttribute("srcdoc")?.trim()) return false
  return !element.getAttribute(mediaSourceAttribute(element))?.trim() && !element.getAttribute("srcset")?.trim()
}

/** Native SVG geometry shared by editor handles and reading-mode links. */
export function imageMapHotspotShape(area: HTMLAreaElement, width: number, height: number,
  coords = (area.getAttribute("coords") ?? "").split(",").map(value => Number(value.trim()))) {
  const shape = area.getAttribute("shape")?.toLowerCase() || "rect"
  if(coords.some(value => !Number.isFinite(value))) return null
  let element: SVGElement | null = null
  if(shape === "rect" && coords.length === 4) {
    element = area.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect")
    element.setAttribute("x", String(Math.min(coords[0], coords[2])))
    element.setAttribute("y", String(Math.min(coords[1], coords[3])))
    element.setAttribute("width", String(Math.abs(coords[2] - coords[0])))
    element.setAttribute("height", String(Math.abs(coords[3] - coords[1])))
  }
  else if(shape === "circle" && coords.length === 3) {
    element = area.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "circle")
    element.setAttribute("cx", String(coords[0]))
    element.setAttribute("cy", String(coords[1]))
    element.setAttribute("r", String(Math.max(0, coords[2])))
  }
  else if(shape === "poly" && coords.length >= 6 && coords.length % 2 === 0) {
    element = area.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "polygon")
    element.setAttribute("points", Array.from({length: coords.length / 2}, (_, index) => (
      `${coords[index * 2]},${coords[index * 2 + 1]}`
    )).join(" "))
  }
  else if(shape === "default") {
    element = area.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect")
    element.setAttribute("x", "0")
    element.setAttribute("y", "0")
    element.setAttribute("width", String(width))
    element.setAttribute("height", String(height))
  }
  for(const name of ["ww-hotspot-transparent", "ww-hotspot-no-border", "ww-hotspot-no-background"]) {
    if(area.classList.contains(name)) element?.classList.add(name)
  }
  return element
}

/** Hotspot bounds in client coordinates, shared by popovers and appendix controls. */
export function imageMapHotspotBounds(area: HTMLAreaElement, image: HTMLImageElement) {
  const rect = image.getBoundingClientRect()
  const width = image.naturalWidth || Number(image.getAttribute("width")) || rect.width
  const height = image.naturalHeight || Number(image.getAttribute("height")) || rect.height
  if(!width || !height || !rect.width || !rect.height) return null
  const coords = (area.getAttribute("coords") ?? "").split(",").map(value => Number(value.trim()))
  if(coords.some(value => !Number.isFinite(value))) return null
  const shape = area.getAttribute("shape")?.toLowerCase() || "rect"
  let xs: number[], ys: number[]
  if(shape === "circle" && coords.length === 3) {
    xs = [coords[0] - coords[2], coords[0] + coords[2]]
    ys = [coords[1] - coords[2], coords[1] + coords[2]]
  }
  else if(shape === "rect" && coords.length === 4 || shape === "poly" && coords.length >= 6 && coords.length % 2 === 0) {
    xs = coords.filter((_, index) => index % 2 === 0)
    ys = coords.filter((_, index) => index % 2 === 1)
  }
  else if(shape === "default") { xs = [0, width]; ys = [0, height] }
  else return null
  const left = rect.left + Math.min(...xs) * rect.width / width
  const right = rect.left + Math.max(...xs) * rect.width / width
  const top = rect.top + Math.min(...ys) * rect.height / height
  const bottom = rect.top + Math.max(...ys) * rect.height / height
  return {left, right, top, bottom, width: right - left, height: bottom - top}
}

/** Positioning is presentation state in an adopted sheet, never authored inline styles. */
export function createImageMapPopoverController(doc: Document, boundsFor = imageMapHotspotBounds) {
  const view = doc.defaultView!
  let sheet: CSSStyleSheet | null = null
  let observer: ResizeObserver | null = null
  const opened = new Map<HTMLElement, {area: HTMLAreaElement, image: HTMLImageElement, rule: string}>()
  const apply = () => {
    if(!sheet) {
      sheet = new view.CSSStyleSheet()
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
    }
    sheet.replaceSync(Array.from(opened.values(), entry => entry.rule).join("\n"))
  }
  const isOpen = (target: HTMLElement) => {
    try { return target.matches(":popover-open") } catch { return false }
  }
  const position = (target: HTMLElement, area: HTMLAreaElement, image: HTMLImageElement) => {
    const bounds = boundsFor(area, image)
    if(!bounds || !target.isConnected || !area.isConnected || !image.isConnected) return false
    const viewport = view.visualViewport
    const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0
    const vw = viewport?.width ?? view.innerWidth, vh = viewport?.height ?? view.innerHeight
    const padding = 8, gap = 8
    const bodyStyle = view.getComputedStyle(doc.body)
    const rootStyle = view.getComputedStyle(doc.documentElement)
    const background = bodyStyle.backgroundColor !== "rgba(0, 0, 0, 0)" && bodyStyle.backgroundColor !== "transparent"
      ? bodyStyle.backgroundColor : rootStyle.backgroundColor !== "rgba(0, 0, 0, 0)" && rootStyle.backgroundColor !== "transparent"
        ? rootStyle.backgroundColor : "Canvas"
    const selector = `[id="${view.CSS.escape(target.id)}"][popover]`
    const base = `position:fixed!important;inset:auto!important;margin:0!important;box-sizing:border-box;min-width:0;min-height:0;width:max-content;max-width:min(24rem,${Math.max(0, vw - 2 * padding)}px)!important;max-height:${Math.max(0, vh - 2 * padding)}px!important;overflow:auto;padding:1rem;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:.5rem;box-shadow:0 4px 20px rgb(0 0 0 / 18%);color:${bodyStyle.color};background:${background};font-family:inherit;`
    opened.set(target, {area, image, rule: `${selector}{${base}left:0!important;top:0!important}`})
    apply()
    const box = target.getBoundingClientRect()
    let left = bounds.right + gap, top = (bounds.top + bounds.bottom - box.height) / 2
    if(left + box.width > vx + vw - padding) {
      left = bounds.left - gap - box.width
      if(left < vx + padding) {
        left = (bounds.left + bounds.right - box.width) / 2
        top = bounds.bottom + gap
        if(top + box.height > vy + vh - padding) top = bounds.top - gap - box.height
      }
    }
    left = Math.max(vx + padding, Math.min(left, vx + vw - padding - box.width))
    top = Math.max(vy + padding, Math.min(top, vy + vh - padding - box.height))
    // Fixed insets start inside the root's leading scrollbar gutter.
    const gutter = doc.documentElement.clientWidth && rootStyle.scrollbarGutter?.includes("both-edges")
      ? Math.max(0, view.innerWidth - doc.documentElement.clientWidth) : 0
    opened.get(target)!.rule = `${selector}{${base}left:${left - gutter}px!important;top:${top}px!important}`
    apply()
    return true
  }
  const open = (area: HTMLAreaElement, image: HTMLImageElement, toggle = false) => {
    const id = area.getAttribute("popovertarget") ?? area.getAttribute("interestfor")
    const target = id ? doc.getElementById(id) : null
    if(!(target instanceof view.HTMLElement) || !target.hasAttribute("popover")) return false
    try {
      if(toggle && isOpen(target)) {
        target.hidePopover()
        opened.delete(target)
        observer?.unobserve(target)
        if(sheet) apply()
        return true
      }
      target.showPopover?.()
      position(target, area, image)
      if(view.ResizeObserver) {
        observer ??= new view.ResizeObserver(() => refresh())
        observer.observe(target)
      }
      return true
    } catch { return false }
  }
  const handleEvent = (event: Event) => {
    const area = event.target instanceof view.Element ? event.target.closest("area") : null
    if(!area || area.namespaceURI !== "http://www.w3.org/1999/xhtml") return
    const attribute = event.type === "click" ? "popovertarget" : "interestfor"
    if(!area.hasAttribute(attribute)) return
    const map = area.closest("map")
    const images = Array.from(doc.querySelectorAll<HTMLImageElement>("img[usemap]"))
      .filter(image => image.getAttribute("usemap") === `#${map?.getAttribute("name")}`)
    const pointer = event as MouseEvent
    const image = images.find(image => {
      const rect = image.getBoundingClientRect()
      return pointer.clientX >= rect.left && pointer.clientX <= rect.right && pointer.clientY >= rect.top && pointer.clientY <= rect.bottom
    }) ?? images[0]
    if(!image) return
    if(event.type === "click") event.preventDefault()
    open(area as HTMLAreaElement, image)
  }
  const refresh = () => {
    for(const [target, {area, image}] of opened) {
      if(!isOpen(target)) { opened.delete(target); observer?.unobserve(target) }
      else if(!position(target, area, image)) {
        try { target.hidePopover() } catch {}
        opened.delete(target)
        observer?.unobserve(target)
      }
    }
    if(sheet) apply()
  }
  const dispose = () => {
    opened.forEach((_, target) => { try { if(isOpen(target)) target.hidePopover() } catch {} })
    opened.clear()
    observer?.disconnect()
    observer = null
    if(sheet) doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(item => item !== sheet)
    sheet = null
  }
  const hasOpenFor = (image: HTMLImageElement) => Array.from(opened.entries())
    .some(([target, entry]) => entry.image === image && isOpen(target))
  return {open, handleEvent, refresh, dispose, hasOpenFor}
}

/** Render intrinsic image-map coordinates without changing authored AREA nodes. */
export function mountImageMapReader(doc: Document, controller: ReturnType<typeof createImageMapPopoverController>, shapeFor = imageMapHotspotShape,
  anchorFactory?: typeof import("./anchor-positioning.js").createAnchorPositioner) {
  const view = doc.defaultView!
  const appendix = doc.body.shadowRoot ?? doc.body.attachShadow({mode: "open"})
  let slot = Array.from(appendix.children).find(element => element.matches("slot:not([name])"))
  if(!slot) { slot = doc.createElement("slot"); appendix.append(slot) }
  const host = doc.createElement("div")
  host.className = "◆image-map-reader"
  const root = host.attachShadow({mode: "open"})
  const style = doc.createElement("style")
  style.textContent = `
    :host { pointer-events:none; }
    svg { position:fixed; z-index:1; overflow:hidden; pointer-events:auto; }
    a { fill:rgb(37 99 235 / 12%); stroke:#2563eb; stroke-width:1.5; cursor:pointer; }
    a:hover, a:focus-visible { fill:rgb(37 99 235 / 24%); stroke-width:2.5; outline:none; }
    a > * { vector-effect:non-scaling-stroke; }
    .ww-hotspot-transparent { fill:transparent; stroke:none; }
    .ww-hotspot-no-border { stroke:none; }
    .ww-hotspot-no-background { fill:transparent; }
    @media print { svg { display:none; } }
  `
  root.append(style)
  appendix.append(host)
  const anchors = anchorFactory?.(doc)
  const overlays = new Map<HTMLImageElement, {svg: SVGSVGElement, areas: HTMLAreaElement[], signature: string}>()
  let pending = 0
  let measuredFallback = false
  const schedule = () => { if(!pending) pending = view.requestAnimationFrame(refresh) }
  const scroll = () => {
    if(measuredFallback || Array.from(overlays.keys()).some(image => controller.hasOpenFor(image))) schedule()
  }
  const isTransformed = (image: Element) => {
    const identity = (value: string) => {
      if(!value || value === "none") return true
      try {
        const matrix = new view.DOMMatrix(value)
        return matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1
          && matrix.e === 0 && matrix.f === 0
      }
      catch { return false }
    }
    const transformedStyle = (element: Element) => {
      const style = view.getComputedStyle(element)
      const rotate = style.rotate || "none", scale = style.scale || "none", zoom = style.zoom || "1"
      return !identity(style.transform) || rotate !== "none" && rotate !== "0deg"
        || scale !== "none" && scale !== "1" || (parseFloat(zoom) || 1) !== 1
    }
    for(let element: Element | null = image; element; element = element.parentElement) {
      if(transformedStyle(element)) return true
      if(element === doc.body) {
        const slot = element.shadowRoot?.querySelector("slot:not([name])")
        if(slot && transformedStyle(slot)) return true
      }
    }
    return false
  }
  const resize = view.ResizeObserver ? new view.ResizeObserver(schedule) : null
  const refresh = () => {
    view.cancelAnimationFrame(pending)
    pending = 0
    const images = new Set(doc.querySelectorAll<HTMLImageElement>("img[usemap]"))
    measuredFallback = false
    for(const [image, overlay] of overlays) {
      if(!images.has(image)) { anchors?.release(overlay.svg); overlay.svg.remove(); resize?.unobserve(image); overlays.delete(image) }
    }
    for(const image of images) {
      const name = image.getAttribute("usemap")?.trim().slice(1)
      const map = image.getAttribute("usemap")?.trim().startsWith("#")
        ? Array.from(doc.querySelectorAll("map[name]")).find(map => map.getAttribute("name") === name) : null
      const areas = Array.from(map?.querySelectorAll("area") ?? [])
      const rect = image.getBoundingClientRect()
      const fallback = !anchors || isTransformed(image)
      const width = image.naturalWidth || Number(image.getAttribute("width")) || rect.width
      const height = image.naturalHeight || Number(image.getAttribute("height")) || rect.height
      let overlay = overlays.get(image)
      if(!areas.length || !width || !height || !rect.width || !rect.height || view.getComputedStyle(image).visibility === "hidden") {
        if(overlay) { anchors?.release(overlay.svg); overlay.svg.remove(); resize?.unobserve(image); overlays.delete(image) }
        continue
      }
      if(!overlay) {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
        svg.setAttribute("preserveAspectRatio", "none")
        overlay = {svg, areas: [], signature: ""}
        overlays.set(image, overlay)
        root.append(svg)
        resize?.observe(image)
      }
      const {svg} = overlay
      if(fallback) {
        anchors?.release(svg)
        svg.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`
        measuredFallback = true
      }
      else {
        for(const property of ["left", "top", "width", "height"]) svg.style.removeProperty(property)
        anchors!.bind(svg, image)
      }
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
      const signature = areas.map(area => area.outerHTML).join("") + `/${width}/${height}`
      if(signature === overlay.signature && areas.every((area, index) => area === overlay!.areas[index])) continue
      overlay.signature = signature
      overlay.areas = areas
      svg.replaceChildren()
      // Native image maps give the first matching AREA priority.
      for(const area of areas.slice().reverse()) {
        if(!area.hasAttribute("href") && !area.hasAttribute("popovertarget") && !area.hasAttribute("interestfor")) continue
        const shape = shapeFor(area, width, height)
        if(!shape) continue
        const link = doc.createElementNS("http://www.w3.org/2000/svg", "a")
        const expected = area.outerHTML
        const current = () => area.isConnected && image.isConnected && area.closest("map") === map
          && image.getAttribute("usemap")?.trim() === `#${map?.getAttribute("name")}` && area.outerHTML === expected
        for(const name of ["href", "target", "rel", "download", "referrerpolicy"]) {
          if(area.hasAttribute(name)) link.setAttribute(name, area.getAttribute(name)!)
        }
        link.setAttribute("tabindex", "0")
        link.setAttribute("aria-label", area.getAttribute("alt") || area.getAttribute("title") || `Hotspot ${areas.indexOf(area) + 1}`)
        link.addEventListener("click", event => {
          if(!current()) { event.preventDefault(); schedule(); return }
          if(area.hasAttribute("popovertarget") || area.hasAttribute("interestfor")) {
            event.preventDefault()
            controller.open(area, image)
          }
        })
        link.addEventListener("pointerover", () => {
          if(current() && area.hasAttribute("interestfor")) controller.open(area, image)
        })
        link.append(shape)
        svg.append(link)
      }
    }
    anchors?.refresh()
    controller.refresh()
  }
  const observer = new view.MutationObserver(schedule)
  observer.observe(doc.body, {subtree:true, childList:true, attributes:true})
  observer.observe(slot, {attributes:true})
  doc.addEventListener("load", schedule, true)
  doc.addEventListener("scroll", scroll, true)
  view.addEventListener("resize", schedule)
  refresh()
  return {
    refresh,
    dispose: () => {
      view.cancelAnimationFrame(pending)
      observer.disconnect()
      resize?.disconnect()
      doc.removeEventListener("load", schedule, true)
      doc.removeEventListener("scroll", scroll, true)
      view.removeEventListener("resize", schedule)
      for(const overlay of overlays.values()) anchors?.release(overlay.svg)
      anchors?.destroy()
      host.remove()
      controller.dispose()
    },
  }
}
