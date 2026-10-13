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

export const mediaElementSelector = mediaTypes.join(", ")

export const timedMediaResourceTypes = ["source", "track"] as const

export type TimedMediaResourceType = typeof timedMediaResourceTypes[number]

export type TimedMediaResourceState = {
  /** Current direct child-node offset. Commands fail safely if it is stale. */
  index: number
  attributes: Record<string, string>
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
  sourceSize?: number
  sourceLabel?: string
  sourceKind?: "file" | "capture" | "recording"
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
  audio: timedMediaAttributes,
  video: [
    ...timedMediaAttributes,
    {name: "poster", label: "Poster", kind: "url", placeholder: "https://…"},
    {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
    {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
    {name: "playsinline", label: "Play inline", kind: "boolean"},
  ],
  iframe: [
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
    {name: "src", label: "Source URL", kind: "url", placeholder: "https://…"},
    {name: "type", label: "MIME type", placeholder: "text/html"},
    {name: "width", label: "Width", kind: "number", placeholder: "Auto"},
    {name: "height", label: "Height", kind: "number", placeholder: "Auto"},
  ],
  object: [
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
    return !element.querySelector("img[src]:not([src='']), img[srcset]:not([srcset='']), source[srcset]:not([srcset=''])")
  }
  if(element.matches("audio, video")) {
    return !element.getAttribute("src")?.trim()
      && !Array.from(element.querySelectorAll(":scope > source[src]")).some(source => source.getAttribute("src")?.trim())
  }
  if(element.matches("iframe") && element.getAttribute("srcdoc")?.trim()) return false
  return !element.getAttribute(mediaSourceAttribute(element))?.trim() && !element.getAttribute("srcset")?.trim()
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
