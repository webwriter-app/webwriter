export const mediaTypes = ["picture", "img", "audio", "video", "iframe", "embed", "object"] as const

export type MediaType = typeof mediaTypes[number]

export const websiteTypes = ["iframe", "embed", "object"] as const

export type WebsiteType = typeof websiteTypes[number]

export const mediaElementSelector = mediaTypes.join(", ")

export type MediaSelectionState = {
  type: MediaType
  attributes: Record<string, string>
}

export type MediaAttributeOption = {
  name: string
  label: string
  kind?: "text" | "url" | "number" | "boolean" | "select"
  placeholder?: string
  options?: Array<{label: string, value: string}>
}

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
