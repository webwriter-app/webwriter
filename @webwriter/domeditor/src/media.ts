export const mediaTypes = ["picture", "img", "audio", "video", "iframe", "embed", "object"] as const

export type MediaType = typeof mediaTypes[number]

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
  {name: "alt", label: "Alternative text", placeholder: "Describe the destination"},
  {name: "target", label: "Open in", placeholder: "_blank or frame name"},
  {name: "rel", label: "Link relationship", placeholder: "noopener noreferrer"},
  {name: "referrerpolicy", label: "Referrer policy", kind: "select", options: [
    {label: "Browser default", value: ""},
    {label: "No referrer", value: "no-referrer"},
    {label: "No referrer when downgraded", value: "no-referrer-when-downgrade"},
    {label: "Origin", value: "origin"},
    {label: "Origin when cross-origin", value: "origin-when-cross-origin"},
    {label: "Same origin", value: "same-origin"},
    {label: "Strict origin", value: "strict-origin"},
    {label: "Strict origin when cross-origin", value: "strict-origin-when-cross-origin"},
    {label: "Unsafe URL", value: "unsafe-url"},
  ]},
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
  {name: "controls", label: "Controls", kind: "boolean"},
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
  return type === "object" ? "data" : "src"
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
  if(element.matches("picture")) {
    return !element.querySelector("img[src]:not([src='']), img[srcset]:not([srcset='']), source[srcset]:not([srcset=''])")
  }
  if(element.matches("audio, video")) {
    return !element.getAttribute("src")?.trim()
      && !Array.from(element.querySelectorAll(":scope > source[src]")).some(source => source.getAttribute("src")?.trim())
  }
  return !element.getAttribute(mediaSourceAttribute(element))?.trim() && !element.getAttribute("srcset")?.trim()
}
