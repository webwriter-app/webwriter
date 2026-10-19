import {EditorFeature} from "."
import {SVG_NAMESPACE, graphicShapeGeometry} from "../graphic"
import type {Schema} from "../schema"
import {MediaCapture} from "../components/media-capture"
import {mediaSourceButtonStyles} from "../components/media-source.styles"
import {stripActiveContent} from "../active-content"
import folderOpen from "@tabler/icons/outline/folder-open.svg?raw"
import screenShare from "@tabler/icons/outline/screen-share.svg?raw"
import playerRecord from "@tabler/icons/outline/player-record.svg?raw"
import arrowRight from "@tabler/icons/outline/arrow-right.svg?raw"
import photo from "@tabler/icons/outline/photo.svg?raw"
import linkIcon from "@tabler/icons/outline/link.svg?raw"
import messageCircle from "@tabler/icons/outline/message-circle.svg?raw"
import worldWww from "@tabler/icons/outline/world-www.svg?raw"
import {$, fixedClientX, authoredClassValue, atomicEditingContainer, adoptStylesheet, cloneInert, createStylesheet, getInertDocument, isAtomicEditingElement, isElement, nodeAtPath, pathFromNode, removeEditorMarker, isWidgetShadowInteraction} from "../utility"
import {
  isEmptyMedia,
  isMediaCaptureMode,
  mediaCaptureModes,
  mediaCaptureOptions,
  isImageMapHotspotShape,
  createImageMapPopoverController,
  imageMapHotspotBounds,
  isMediaType,
  isTimedMediaResourceType,
  isWebsiteType,
  mediaAttributeOptions,
  mediaContainerForNode,
  mediaCropInsets,
  mediaDefaultHTML,
  mediaElementSelector,
  imageMapAreaAttributeOptions,
  mediaSourceAttribute,
  mediaSourceTarget,
  timedMediaResourceAttributeOptions,
  websiteTypes,
  type MediaSelectionState,
  type MediaType,
  type MediaCaptureMode,
  type ImageMapAreaState,
  type ImageMapHotspotShape,
  type TimedMediaResourceState,
  type TimedMediaResourceType,
  type WebsiteType,
} from "../media"

const mediaSelector = mediaElementSelector
const placeholderMediaType = (target: Element): MediaType => target.namespaceURI === SVG_NAMESPACE && target.localName === "image" ? "img" : target.localName as MediaType
const isGraphicImage = (target: Element) => target.namespaceURI === SVG_NAMESPACE && target.localName === "image"
const sourceEditingBlocked = (target: Element, schema: Schema) => {
  if(!isGraphicImage(target)) return Boolean(atomicEditingContainer(target.parentElement, schema))
  // SVG is atomic to text editing, but its native images are editable by graphics.
  for(let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if(isAtomicEditingElement(parent, schema) && !(parent.namespaceURI === SVG_NAMESPACE && parent.localName === "svg")) return true
  }
  return false
}
const htmlNamespace = "http://www.w3.org/1999/xhtml"
const maximumMediaFallbackLength = 1_000_000

const mediaInteractionShieldStylesheet = createStylesheet(`
  :host {
    position: fixed;
    display: block;
    z-index: 2147483642;
    pointer-events: auto;
    background: transparent;
    touch-action: none;
  }
  :host([hidden]) { display: none; }
  svg {
    display: none;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 64px;
    height: 64px;
    color: #6b7280;
    pointer-events: none;
  }
  :host([data-empty-website]) svg { display: block; }
`)

const isTimedResourceElement = (node: Node, resource?: TimedMediaResourceType): node is Element => (
  node instanceof Element
  && node.namespaceURI === htmlNamespace
  && (resource ? node.localName === resource : isTimedMediaResourceType(node.localName))
)

const stateAttributes = (element: Element) => Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
  if(attribute.name !== "class") return [[attribute.name, attribute.value]]
  const classes = authoredClassValue(attribute.value)
  return classes ? [["class", classes]] : []
}))

const equalAttributes = (element: Element, expected: Record<string, string>) => {
  const current = stateAttributes(element)
  const names = Object.keys(current)
  return names.length === Object.keys(expected).length
    && names.every(name => current[name] === expected[name])
}

const mediaPlaceholderStylesheet = createStylesheet(`
  :host {
    --control-height: 2rem;
    position: fixed;
    z-index: 2147483646;
    display: none;
    box-sizing: border-box;
    place-items: center;
    overflow: clip;
    padding: .25rem;
    color: #f3f4f6;
    background: rgba(31, 41, 55, 0.5);
    font: 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: none;
    user-select: none;
    container-type: size;
  }
  :host([data-open]) { display: grid; }
  .expand {
    display: none;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 2px;
    border: 0;
    border-radius: .35rem;
    color: #343740;
    background: rgba(255, 255, 255, .75);
    cursor: pointer;
  }
  .content {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    width: min(52rem, 100%);
    min-width: 0;
    gap: .65rem;
  }
  button, input { box-sizing: border-box; font: inherit; pointer-events: auto; }
  [hidden] { display: none !important; }
  ${mediaSourceButtonStyles.cssText}
  .label { white-space: nowrap; }
  .icon { display: flex; flex: 0 0 auto; }
  .icon svg { display: block; width: 1.125rem; height: 1.125rem; }
  .or { flex: 0 0 auto; color: #d1d5db; font-size: 1rem; }
  .url-row { position: relative; flex: 1 1 20rem; min-width: 3.5rem; }
  .url {
    caret-color: auto;
    user-select: text;
    -webkit-user-select: text;
    min-width: 0;
    width: 100%;
    height: var(--control-height);
    padding: .35rem .65rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
  }
  .url:placeholder-shown {
    user-select: none;
    -webkit-user-select: none;
  }
  .url::selection {
    color: white;
    background-color: #0078d7;
  }
  .url[aria-invalid="true"] {
    border-color: #dc2626;
    box-shadow: inset 0 0 0 1px #dc2626;
    background: #fff1f2;
  }
  .apply {
    position: absolute;
    inset-inline-end: 2px;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: calc(1.125rem + 4px);
    height: calc(1.125rem + 4px);
    padding: 2px;
    border: 0;
    border-radius: 50%;
    color: #343740;
    background: rgba(255, 255, 255, 0.5);
    cursor: pointer;
  }
  .apply:hover { background: rgba(238, 244, 251, 0.5); }
  .apply:active { color: #1e4f87; background: rgba(196, 220, 244, 0.5); }
  input:focus { outline: none; }
  button:focus-visible { outline: 2px solid #60a5fa; outline-offset: -2px; }
  @container (max-width: 30rem) {
    .file-options .label { display: none; }
    .file-options button { width: var(--control-height); padding: 0; }
  }
  @container (max-width: 24rem) {
    .or { display: none; }
    .content { gap: .35rem; }
  }
  @container (max-width: 10rem) {
    .url-row { flex-basis: 100%; }
  }
  /* A shallow media box has room for one row only. Keep the input's preferred
   * width until the button labels have yielded, then let the input shrink. */
  @container (max-height: 5.25rem) {
    .content {
      --control-height: min(2rem, 100cqh);
      flex-wrap: nowrap;
      gap: .35rem;
    }
    .file-options { flex-shrink: 0; }
    .url-row { flex-basis: 20rem; min-width: min(3.5rem, 25cqw); }
    .url { padding-block: 0; }
    .or { display: none; }
  }
  @container (max-height: 5.25rem) and (max-width: 52rem) {
    .file-options .label { display: none; }
    .file-options button { width: clamp(calc(1.125rem + .375rem + 1px), 18cqw, var(--control-height)); padding: 0; }
  }
  :host([data-compact]) .expand { display: grid; }
  :host([data-compact]) .content { display: none; }
  :host([data-compact][data-popup-open]) .content {
    --control-height: 2rem;
    position: fixed;
    inset: auto;
    margin: 0;
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    gap: .65rem;
    padding: .65rem;
    border: 1px solid #c7c9ce;
    border-radius: .65rem;
    background: white;
    color: #343740;
    box-shadow: 0 3px 12px #0003;
    overflow: visible;
    pointer-events: auto;
  }
  :host([data-compact][data-popup-open]) .content::before {
    content: "";
    position: absolute;
    left: var(--bubble-arrow);
    top: -5px;
    width: 8px;
    height: 8px;
    border-top: 1px solid #c7c9ce;
    border-left: 1px solid #c7c9ce;
    background: white;
    transform: rotate(45deg);
  }
  :host([data-popup-above]) .content::before {
    top: auto;
    bottom: -5px;
    transform: rotate(225deg);
  }
  :host([data-compact]) .file-options .label { display: none; }
  :host([data-compact]) .file-options button { width: 2rem; padding: 0; }
  :host([data-compact]) .url-row { flex-basis: 100%; min-width: 0; }
  :host([data-compact]) .or { display: none; }
`)

class MediaPlaceholder {
  readonly element = document.createElement("div")
  readonly root: ShadowRoot
  target: Element | null = null
  onSource: ((target: Element, source: string | Blob, fileName?: string) => void) | null = null
  onCapture: ((target: Element, mode: MediaCaptureMode) => void) | null = null
  onFocus: ((target: Element) => void) | null = null
  onInteractionChange: (() => void) | null = null
  private focusWithin = false
  private pickerOpen = false
  private interactionActive = false

  get isInteracting() {
    return this.element.isConnected && this.interactionActive
  }

  constructor(private readonly schema: Schema) {
    this.element.classList.add("◆", "◆editor-only", "◆media-placeholder")
    this.element.contentEditable = "false"
    this.element.setAttribute("part", "media-placeholder")
    this.element.setAttribute("aria-hidden", "true")
    const root = this.element.attachShadow({mode: "open"})
    this.root = root
    adoptStylesheet(root, mediaPlaceholderStylesheet)
    root.innerHTML = `
      <button class="expand" type="button" aria-label="Add media" title="Add media" aria-expanded="false" aria-controls="media-inputs">
        <span class="icon" aria-hidden="true">${photo}</span>
      </button>
      <div class="content" id="media-inputs">
        <div class="file-options" role="group" aria-label="Media source">
          <button class="file" type="button" aria-label="Select file" title="Select file">
            <span class="icon" aria-hidden="true">${folderOpen}</span><span class="label">Select file</span>
          </button>
          <button class="screen" type="button" aria-label="Capture screen" title="Capture screen">
            <span class="icon" aria-hidden="true">${screenShare}</span><span class="label">Capture screen</span>
          </button>
          <button class="record" type="button" aria-label="Record" title="Record">
            <span class="icon" aria-hidden="true">${playerRecord}</span><span class="label">Record</span>
          </button>
        </div>
        <input class="picker" type="file" hidden />
        <span class="or">or</span>
        <div class="url-row">
          <input class="url" type="url" required />
          <button class="apply" type="button" aria-label="Apply URL" title="Apply URL">
            <span class="icon" aria-hidden="true">${arrowRight}</span>
          </button>
        </div>
      </div>
    `

    const picker = root.querySelector<HTMLInputElement>(".picker")!
    const url = root.querySelector<HTMLInputElement>(".url")!
    const file = root.querySelector<HTMLButtonElement>(".file")!
    root.querySelector<HTMLButtonElement>(".expand")!.addEventListener("click", () => {
      if(!this.target?.isConnected || !this.element.hasAttribute("data-compact")) return
      if(this.element.hasAttribute("data-popup-open")) this.closePopup()
      else {
        this.element.setAttribute("data-popup-open", "")
        root.querySelector(".expand")!.setAttribute("aria-expanded", "true")
        root.querySelector<HTMLElement>(".content")!.showPopover?.()
        this.positionPopup()
        this.updateUrlHint()
        url.focus({preventScroll: true})
      }
    })
    root.querySelector<HTMLElement>(".content")!.addEventListener("toggle", event => {
      if((event as ToggleEvent).newState === "closed") this.closePopup()
    })
    root.addEventListener("keydown", event => {
      if((event as KeyboardEvent).key === "Escape" && this.element.hasAttribute("data-popup-open")) {
        event.preventDefault()
        this.closePopup()
        root.querySelector<HTMLButtonElement>(".expand")!.focus({preventScroll: true})
      }
    })
    root.addEventListener("pointerdown", event => {
      if((event as PointerEvent).button !== 0 || !(event.target instanceof Element) || !event.target.closest("button, input")) return
      this.beginInteraction()
      if(this.target) this.onFocus?.(this.target)
    })
    root.addEventListener("focusin", () => {
      this.focusWithin = true
      this.beginInteraction()
      if(this.target) this.onFocus?.(this.target)
    })
    root.addEventListener("focusout", () => {
      this.focusWithin = false
      queueMicrotask(() => {
        if(this.focusWithin || this.pickerOpen) return
        this.interactionActive = false
        this.onInteractionChange?.()
      })
    })
    file.addEventListener("click", () => this.selectFile())
    for(const source of ["screen", "record"] as const) {
      root.querySelector<HTMLButtonElement>(`.${source}`)!.addEventListener("click", () => {
        if(!this.target) return
        const option = mediaCaptureOptions(placeholderMediaType(this.target))
          .find(option => option.mode.startsWith("screen-") === (source === "screen"))
        if(option) this.onCapture?.(this.target, option.mode)
      })
    }
    root.querySelector<HTMLButtonElement>(".apply")!.addEventListener("click", () => this.applyUrl())
    url.addEventListener("input", () => this.clearUrlError())
    url.addEventListener("keydown", event => {
      if(event.key !== "Enter") return
      event.preventDefault()
      this.applyUrl()
    })
    picker.addEventListener("change", () => {
      this.pickerOpen = false
      const file = picker.files?.[0]
      if(!file || !this.target) return
      const target = this.target
      if(document.body.contains(target) && isEmptyMedia(target) && !sourceEditingBlocked(target, this.schema)) {
        this.onSource?.(target, file, file.name)
      }
      picker.value = ""
    })
    picker.addEventListener("cancel", () => {
      this.pickerOpen = false
      file.focus({preventScroll: true})
      this.beginInteraction()
    })
    this.element.addEventListener("pointerdown", event => event.stopPropagation())
  }

  private beginInteraction() {
    this.interactionActive = true
    this.onInteractionChange?.()
  }

  private closePopup() {
    this.element.removeAttribute("data-popup-open")
    this.root.querySelector(".expand")!.setAttribute("aria-expanded", "false")
    const content = this.root.querySelector<HTMLElement>(".content")!
    if(content.hasAttribute("popover")) content.hidePopover?.()
  }

  private updateUrlHint() {
    const url = this.root.querySelector<HTMLInputElement>(".url")!
    const label = url.getAttribute("aria-label")!
    url.placeholder = url.getBoundingClientRect().width < 240 ? "URL" : `Enter ${label[0].toLowerCase()}${label.slice(1)}`
  }

  private positionPopup() {
    const rect = this.element.getBoundingClientRect()
    const content = this.root.querySelector<HTMLElement>(".content")!
    const width = Math.min(360, window.innerWidth - 16)
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8))
    content.style.width = `${width}px`
    const height = content.getBoundingClientRect().height
    const above = rect.bottom + height + 16 > window.innerHeight && rect.top > height + 16
    const top = above ? rect.top - height - 8 : Math.min(rect.bottom + 8, window.innerHeight - height - 8)
    this.element.toggleAttribute("data-popup-above", above)
    Object.assign(content.style, {left: `${fixedClientX(left)}px`, top: `${Math.max(8, top)}px`})
    content.style.setProperty("--bubble-arrow", `${Math.max(12, Math.min(width - 20, rect.left + rect.width / 2 - left - 4))}px`)
  }

  dispose() {
    this.closePopup()
    this.target = null
    this.onSource = null
    this.onCapture = null
    this.onFocus = null
    this.onInteractionChange = null
    this.element.remove()
  }

  private applyUrl() {
    if(!this.target || !document.body.contains(this.target) || !isEmptyMedia(this.target)
      || sourceEditingBlocked(this.target, this.schema)) return
    const input = this.root.querySelector<HTMLInputElement>(".url")!
    const source = input.value.trim()
    let url: URL | undefined
    try { url = new URL(source) } catch {}
    this.clearUrlError()
    if(!url || !["http:", "https:"].includes(url.protocol)) {
      const message = "Enter a valid http:// or https:// URL."
      input.setCustomValidity(message)
      input.setAttribute("aria-invalid", "true")
      input.title = message
      input.focus({preventScroll: true})
      input.reportValidity()
      return
    }
    this.onSource?.(this.target, url.href)
  }

  private clearUrlError() {
    const input = this.root.querySelector<HTMLInputElement>(".url")!
    input.setCustomValidity("")
    input.removeAttribute("aria-invalid")
    input.removeAttribute("title")
  }

  selectFile() {
    if(!this.target || !document.body.contains(this.target) || !isEmptyMedia(this.target)) return
    this.beginInteraction()
    this.onFocus?.(this.target)
    this.pickerOpen = true
    this.root.querySelector<HTMLInputElement>(".picker")!.click()
  }

  showFor(target: Element) {
    if(this.target !== target) {
      this.closePopup()
      this.root.querySelector<HTMLInputElement>(".url")!.value = ""
      this.clearUrlError()
    }
    this.target = target
    const type = placeholderMediaType(target)
    this.element.setAttribute("data-media", type)
    const noun = type === "picture" || type === "img" ? "image"
      : isWebsiteType(type) ? "website" : type
    const picker = this.root.querySelector<HTMLInputElement>(".picker")!
    const url = this.root.querySelector<HTMLInputElement>(".url")!
    const captureAvailable = mediaCaptureOptions(type).length > 0
    this.root.querySelector<HTMLButtonElement>(".screen")!.hidden = !captureAvailable
    this.root.querySelector<HTMLButtonElement>(".record")!.hidden = !captureAvailable
    picker.accept = type === "picture" || type === "img" ? "image/*"
      : type === "audio" ? "audio/*"
      : type === "video" ? "video/*"
      : ".html,.htm,text/html"
    url.placeholder = `Enter ${noun} URL`
    url.setAttribute("aria-label", `${noun[0].toUpperCase()}${noun.slice(1)} URL`)
    const rect = target.getBoundingClientRect()
    const compact = rect.width > 0 && rect.height > 0 && (rect.width < 120 || rect.height < 28)
    if(!compact) this.closePopup()
    this.element.toggleAttribute("data-compact", compact)
    const content = this.root.querySelector<HTMLElement>(".content")!
    if(compact) {
      if(content.getAttribute("popover") !== "auto") content.setAttribute("popover", "auto")
    }
    else {
      content.removeAttribute("popover")
      content.removeAttribute("style")
    }
    this.root.querySelector(".expand")!.setAttribute("aria-label", `Add ${noun}`)
    Object.assign(this.element.style, {
      left: `${fixedClientX(rect.left)}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    this.element.setAttribute("data-open", "")
    this.element.removeAttribute("aria-hidden")
    if(this.element.hasAttribute("data-popup-open")) this.positionPopup()
    this.updateUrlHint()
  }

  hide() {
    this.closePopup()
    this.target = null
    this.element.removeAttribute("data-open")
    this.element.setAttribute("aria-hidden", "true")
  }
}

const imageMapOverlayStylesheet = createStylesheet(`
  :host {
    position: fixed;
    z-index: 2147483643;
    display: none;
    box-sizing: border-box;
    pointer-events: none;
  }
  :host([data-open]) { display: block; }
  :host([data-drawing]) { pointer-events: auto; cursor: crosshair; }
  :host([data-editing]) .hotspot { pointer-events: auto; cursor: move; }
  .handle { fill: white; stroke: #2563eb; stroke-width: 1.5; vector-effect: non-scaling-stroke; pointer-events: auto; cursor: crosshair; }
  svg { touch-action: none; }
  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .hotspot {
    fill: rgb(37 99 235 / 16%);
    stroke: #2563eb;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .preview {
    fill: rgb(245 158 11 / 22%);
    stroke: #f59e0b;
    stroke-width: 2;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .vertex {
    fill: #f59e0b;
    stroke: white;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .panel {
    position: absolute;
    top: .5rem;
    left: .5rem;
    display: none;
    align-items: center;
    gap: .4rem;
    max-width: calc(100% - 1rem);
    padding: .35rem .45rem;
    border-radius: .3rem;
    color: white;
    background: rgb(31 41 55 / 94%);
    box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
    font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: default;
    pointer-events: auto;
  }
  :host([data-drawing]) .panel { display: flex; }
  .instruction { min-width: 0; }
  button {
    flex: 0 0 auto;
    min-height: 1.65rem;
    padding: .2rem .45rem;
    border: 1px solid #c7c9ce;
    border-radius: .25rem;
    color: #343740;
    background: white;
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: #eef4fb; }
  button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
  button:disabled { opacity: .5; cursor: default; }
  .actions { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; display:none; }
  :host([data-editing]:not([data-drawing])) .actions { display:block; }
  .action-buttons { box-sizing:border-box; display:flex; gap:2px; padding:2px; border-radius:5px; background:rgb(255 255 255 / 94%); box-shadow:0 1px 5px rgb(0 0 0 / 20%); }
  .action-buttons button { flex:1; min-width:0; min-height:0; padding:2px; display:grid; place-items:center; color:#526b86; }
  .action-buttons button[aria-pressed="true"] { background:#e4effb; color:#2563eb; }
  .action-buttons svg { display:block; width:100%; height:100%; max-width:20px; max-height:20px; }
  .url-editor { box-sizing:border-box; position:absolute; top:calc(100% + 4px); left:50%; transform:translateX(-50%); width:clamp(120px,28vw,240px); padding:4px; border:1px solid #c8d2df; border-radius:4px; background:white; box-shadow:0 2px 8px rgb(0 0 0 / 18%); }
  .url-editor[hidden] { display:none; }
  .url-editor input { box-sizing:border-box; width:100%; min-width:0; padding:5px; border:1px solid #c8d2df; border-radius:3px; font:12px system-ui; }
`)

type ImageMapGeometry = {
  left: number
  top: number
  width: number
  height: number
  coordinateWidth: number
  coordinateHeight: number
}

type ImageMapDrawingSession = {
  image: HTMLImageElement
  map: HTMLMapElement
  shape: ImageMapHotspotShape
  geometry: ImageMapGeometry
  newMap?: boolean
  usemap?: string | null
}

const imageMapGeometry = (image: HTMLImageElement): ImageMapGeometry | null => {
  const rect = image.getBoundingClientRect()
  if(!Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0) return null
  const authoredWidth = Number(image.getAttribute("width"))
  const authoredHeight = Number(image.getAttribute("height"))
  const coordinateWidth = image.naturalWidth || (authoredWidth > 0 ? authoredWidth : rect.width)
  const coordinateHeight = image.naturalHeight || (authoredHeight > 0 ? authoredHeight : rect.height)
  if(!Number.isFinite(coordinateWidth) || !Number.isFinite(coordinateHeight)
    || coordinateWidth <= 0 || coordinateHeight <= 0) return null
  return {left: rect.left, top: rect.top, width: rect.width, height: rect.height, coordinateWidth, coordinateHeight}
}

const equalImageMapGeometry = (left: ImageMapGeometry | null, right: ImageMapGeometry) => !!left
  && (["left", "top", "width", "height", "coordinateWidth", "coordinateHeight"] as const)
    .every(name => Math.abs(left[name] - right[name]) < 0.5)

class ImageMapOverlay {
  readonly element = document.createElement("div")
  readonly root: ShadowRoot
  image: HTMLImageElement | null = null
  map: HTMLMapElement | null = null
  onCommit: ((session: ImageMapDrawingSession, coords: string) => boolean) | null = null
  onEdit: ((area: HTMLAreaElement, expected: Record<string, string>, coords: string) => boolean) | null = null
  onRemove: ((area: HTMLAreaElement, expected: Record<string, string>) => boolean) | null = null
  onAction: ((area: HTMLAreaElement, expected: Record<string, string>, kind: "link" | "popover", value?: string) => boolean) | null = null
  private readonly areaControls = new Map<HTMLAreaElement, HTMLDivElement>()
  private selectedArea: HTMLAreaElement | null = null
  private drag: {image: HTMLImageElement, map: HTMLMapElement, area: HTMLAreaElement, expected: Record<string, string>, geometry: ImageMapGeometry,
    start: [number, number], coords: number[], next: number[], vertex: number | null} | null = null
  private readonly shapeAreas = new WeakMap<Element, HTMLAreaElement>()
  private readonly handleVertices = new WeakMap<Element, number>()
  private session: ImageMapDrawingSession | null = null
  private startPoint: [number, number] | null = null
  private currentPoint: [number, number] | null = null
  private polygonPoints: Array<[number, number]> = []

  constructor() {
    this.element.classList.add("◆", "◆editor-only", "◆image-map-overlay")
    this.element.contentEditable = "false"
    this.element.tabIndex = -1
    this.element.setAttribute("part", "image-map-overlay")
    this.element.setAttribute("aria-hidden", "true")
    this.root = this.element.attachShadow({mode: "open"})
    adoptStylesheet(this.root, imageMapOverlayStylesheet)
    this.root.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="areas"></g>
        <g class="preview-layer"></g>
      </svg>
      <div class="panel">
        <span class="instruction"></span>
        <button class="finish" type="button">Finish polygon</button>
        <button class="cancel" type="button">Cancel</button>
      </div>
    `
    const svg = this.root.querySelector<SVGSVGElement>("svg")!
    svg.addEventListener("pointerdown", this.handlePointerDown)
    svg.addEventListener("pointermove", this.handlePointerMove)
    svg.addEventListener("pointerup", this.handlePointerUp)
    svg.addEventListener("click", this.handleClick)
    svg.addEventListener("pointercancel", () => this.cancelDrawing())
    svg.addEventListener("dblclick", event => {
      if(this.session?.shape !== "poly") return
      event.preventDefault()
      this.finishPolygon()
    })
    this.root.querySelector<HTMLButtonElement>(".finish")!.addEventListener("click", () => this.finishPolygon())
    this.root.querySelector<HTMLButtonElement>(".cancel")!.addEventListener("click", () => this.cancelDrawing())
    this.element.addEventListener("keydown", event => {
      if(event.composedPath().some(node => node instanceof Element && node.matches("input, textarea, select, [contenteditable='true']"))) return
      if((event.key === "Backspace" || event.key === "Delete") && this.selectedArea?.isConnected && this.map?.contains(this.selectedArea)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.onRemove?.(this.selectedArea, stateAttributes(this.selectedArea))
        this.selectedArea = null
        if(this.image && this.map) this.showFor(this.image, this.map)
      }
      else if(event.key === "Escape") {
        event.preventDefault()
        this.cancelDrawing()
      }
      else if(event.key === "Enter" && this.session?.shape === "poly") {
        event.preventDefault()
        this.finishPolygon()
      }
    })
  }

  get isDrawing() {
    return this.session !== null
  }

  showFor(image: HTMLImageElement, map: HTMLMapElement, editing = this.element.hasAttribute("data-editing")) {
    this.element.toggleAttribute("data-editing", editing)
    if(this.image !== image || this.map !== map) this.selectedArea = null
    this.image = image
    this.map = map
    const geometry = imageMapGeometry(image)
    if(!geometry) {
      this.element.removeAttribute("data-open")
      this.element.setAttribute("aria-hidden", "true")
      return
    }
    Object.assign(this.element.style, {
      left: `${fixedClientX(geometry.left)}px`,
      top: `${geometry.top}px`,
      width: `${geometry.width}px`,
      height: `${geometry.height}px`,
    })
    const svg = this.root.querySelector<SVGSVGElement>("svg")!
    svg.setAttribute("preserveAspectRatio", "none")
    svg.setAttribute("viewBox", `0 0 ${geometry.coordinateWidth} ${geometry.coordinateHeight}`)
    this.element.setAttribute("data-open", "")
    this.element.removeAttribute("aria-hidden")
    this.renderAreas(geometry)
  }

  hide() {
    this.clearDrawing()
    this.selectedArea = null
    this.areaControls.forEach(control => control.remove())
    this.areaControls.clear()
    this.image = null
    this.map = null
    this.element.removeAttribute("data-open")
    this.element.setAttribute("aria-hidden", "true")
  }

  startDrawing(shape: ImageMapHotspotShape, newMap = false) {
    if(!isImageMapHotspotShape(shape) || !this.image || !this.map) return false
    const geometry = imageMapGeometry(this.image)
    if(!geometry || !this.image.isConnected || !newMap && !this.map.isConnected) return false
    this.session = {image: this.image, map: this.map, shape, geometry, newMap, usemap: this.image.getAttribute("usemap")}
    this.startPoint = null
    this.currentPoint = null
    this.polygonPoints = []
    this.element.setAttribute("data-drawing", shape)
    this.element.removeAttribute("aria-hidden")
    const instruction = shape === "rect" ? "Drag across the rectangular hotspot."
      : shape === "circle" ? "Drag from the hotspot centre to its edge."
      : "Click each polygon corner, then finish or double-click."
    this.root.querySelector<HTMLElement>(".instruction")!.textContent = instruction
    const finish = this.root.querySelector<HTMLButtonElement>(".finish")!
    finish.hidden = shape !== "poly"
    finish.disabled = true
    this.renderPreview()
    this.element.focus({preventScroll: true})
    return true
  }

  private pointForEvent(event: PointerEvent): [number, number] | null {
    const geometry = this.session?.geometry ?? this.drag?.geometry
    if(!geometry) return null
    const x = Math.max(0, Math.min(geometry.coordinateWidth,
      (event.clientX - geometry.left) * geometry.coordinateWidth / geometry.width))
    const y = Math.max(0, Math.min(geometry.coordinateHeight,
      (event.clientY - geometry.top) * geometry.coordinateHeight / geometry.height))
    return [Math.round(x), Math.round(y)]
  }

  private handlePointerDown = (event: PointerEvent) => {
    if(event.button !== 0) return
    if(!this.session && this.element.hasAttribute("data-editing")) {
      const target = event.target instanceof Element ? event.target : null
      const area = target ? this.shapeAreas.get(target) : null
      const geometry = this.image ? imageMapGeometry(this.image) : null
      if(!area || !geometry || !area.isConnected) return
      const coords = (area.getAttribute("coords") ?? "").split(",").map(Number)
      if(!isImageMapHotspotShape(area.getAttribute("shape")?.toLowerCase() || "rect")) return
      event.preventDefault()
      event.stopPropagation()
      this.selectedArea = area
      this.element.focus({preventScroll: true})
      this.drag = {image: this.image!, map: this.map!, area, expected: stateAttributes(area), geometry,
        start: [0, 0], coords, next: coords, vertex: this.handleVertices.get(target!) ?? null}
      this.drag.start = this.pointForEvent(event)!
      ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
      this.renderAreas(geometry)
      return
    }
    if(!this.session || this.session.shape === "poly") return
    const point = this.pointForEvent(event)
    if(!point) return
    event.preventDefault()
    this.startPoint = point
    this.currentPoint = point
    ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
    this.renderPreview()
  }

  private handlePointerMove = (event: PointerEvent) => {
    if(this.drag) {
      const point = this.pointForEvent(event)
      if(!point) return
      const {coords, start, vertex, area} = this.drag
      const dx = point[0] - start[0], dy = point[1] - start[1]
      const next = [...coords]
      const circle = area.getAttribute("shape")?.toLowerCase() === "circle"
      if(vertex !== null) {
        if(circle) next[2] = Math.max(1, Math.round(Math.hypot(point[0] - coords[0], point[1] - coords[1])))
        else if(area.getAttribute("shape")?.toLowerCase() === "rect" || !area.hasAttribute("shape")) {
          next[vertex === 0 || vertex === 6 ? 0 : 2] = point[0]
          next[vertex === 0 || vertex === 4 ? 1 : 3] = point[1]
        }
        else { next[vertex] = point[0]; next[vertex + 1] = point[1] }
      }
      else for(let index = 0; index < (circle ? 2 : next.length); index += 2) {
        next[index] += dx; next[index + 1] += dy
      }
      this.drag.next = next
      this.renderAreas(this.drag.geometry)
      return
    }
    if(!this.session || this.session.shape === "poly" || !this.startPoint) return
    const point = this.pointForEvent(event)
    if(!point) return
    this.currentPoint = point
    this.renderPreview()
  }

  private handlePointerUp = (event: PointerEvent) => {
    if(this.drag) {
      this.handlePointerMove(event)
      const drag = this.drag
      this.drag = null
      if(this.image === drag.image && this.map === drag.map && drag.image.isConnected
        && equalImageMapGeometry(imageMapGeometry(drag.image), drag.geometry)
        && drag.area.isConnected && this.map?.contains(drag.area) && equalAttributes(drag.area, drag.expected)) {
        if(drag.next.some((value, index) => value !== drag.coords[index])) {
          const coords = drag.area.getAttribute("shape")?.toLowerCase() === "rect" || !drag.area.hasAttribute("shape")
            ? [Math.min(drag.next[0], drag.next[2]), Math.min(drag.next[1], drag.next[3]),
              Math.max(drag.next[0], drag.next[2]), Math.max(drag.next[1], drag.next[3])]
            : drag.next
          this.onEdit?.(drag.area, drag.expected, coords.join(","))
        }
      }
      if(this.image && this.map) this.showFor(this.image, this.map)
      return
    }
    if(!this.session || this.session.shape === "poly" || !this.startPoint) return
    const point = this.pointForEvent(event)
    if(point) this.currentPoint = point
    const coords = this.currentShapeCoordinates()
    if(coords) this.commit(coords)
    else this.cancelDrawing()
  }

  private handleClick = (event: MouseEvent) => {
    if(!this.session || this.session.shape !== "poly" || event.detail > 1) return
    const point = this.pointForEvent(event as PointerEvent)
    if(!point) return
    event.preventDefault()
    this.polygonPoints.push(point)
    this.root.querySelector<HTMLButtonElement>(".finish")!.disabled = this.polygonPoints.length < 3
    this.renderPreview()
  }

  private finishPolygon() {
    if(this.session?.shape !== "poly" || this.polygonPoints.length < 3) return
    this.commit(this.polygonPoints.flat().join(","))
  }

  private currentShapeCoordinates() {
    if(!this.session || !this.startPoint || !this.currentPoint) return null
    const [startX, startY] = this.startPoint
    const [endX, endY] = this.currentPoint
    if(this.session.shape === "rect") {
      const left = Math.min(startX, endX)
      const top = Math.min(startY, endY)
      const right = Math.max(startX, endX)
      const bottom = Math.max(startY, endY)
      return right > left && bottom > top ? [left, top, right, bottom].join(",") : null
    }
    const radius = Math.round(Math.hypot(endX - startX, endY - startY))
    return radius > 0 ? [startX, startY, radius].join(",") : null
  }

  private commit(coords: string) {
    const session = this.session
    const committed = Boolean(session && equalImageMapGeometry(imageMapGeometry(session.image), session.geometry)
      && this.onCommit?.(session, coords))
    this.clearDrawing()
    if(committed && this.image && this.map) this.showFor(this.image, this.map)
    else if(!committed) this.hide()
  }

  private cancelDrawing() {
    const pending = this.session?.newMap
    this.clearDrawing()
    if(pending) this.hide()
    else if(this.image && this.map) this.showFor(this.image, this.map)
  }

  private clearDrawing() {
    this.session = null
    this.drag = null
    this.startPoint = null
    this.currentPoint = null
    this.polygonPoints = []
    this.element.removeAttribute("data-drawing")
    this.root.querySelector<SVGElement>(".preview-layer")!.replaceChildren()
  }

  private renderAreas(geometry: ImageMapGeometry) {
    const group = this.root.querySelector<SVGElement>(".areas")!
    const shapes = Array.from(this.map?.querySelectorAll("area") ?? []).flatMap(area => {
      const shape = area.getAttribute("shape")?.toLowerCase() || "rect"
      const coords = this.drag?.area === area ? this.drag.next
        : (area.getAttribute("coords") ?? "").split(",").map(value => Number(value.trim()))
      if(coords.some(value => !Number.isFinite(value))) return []
      let element: SVGElement | null = null
      if(shape === "rect" && coords.length === 4) {
        element = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        element.setAttribute("x", String(Math.min(coords[0], coords[2])))
        element.setAttribute("y", String(Math.min(coords[1], coords[3])))
        element.setAttribute("width", String(Math.abs(coords[2] - coords[0])))
        element.setAttribute("height", String(Math.abs(coords[3] - coords[1])))
      }
      else if(shape === "circle" && coords.length === 3) {
        element = document.createElementNS("http://www.w3.org/2000/svg", "circle")
        element.setAttribute("cx", String(coords[0]))
        element.setAttribute("cy", String(coords[1]))
        element.setAttribute("r", String(Math.max(0, coords[2])))
      }
      else if(shape === "poly" && coords.length >= 6 && coords.length % 2 === 0) {
        element = document.createElementNS("http://www.w3.org/2000/svg", "polygon")
        element.setAttribute("points", Array.from({length: coords.length / 2}, (_, index) => (
          `${coords[index * 2]},${coords[index * 2 + 1]}`
        )).join(" "))
      }
      else if(shape === "default") {
        element = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        element.setAttribute("x", "0")
        element.setAttribute("y", "0")
        element.setAttribute("width", String(geometry.coordinateWidth))
        element.setAttribute("height", String(geometry.coordinateHeight))
      }
      if(!element) return []
      element.classList.add("hotspot")
      this.shapeAreas.set(element, area)
      const handles: SVGElement[] = []
      if(area === this.selectedArea && this.element.hasAttribute("data-editing") && isImageMapHotspotShape(shape)) {
        const points = shape === "circle" ? [[coords[0] + coords[2], coords[1], 2]]
          : shape === "rect" ? [[coords[0], coords[1], 0], [coords[2], coords[3], 2], [coords[2], coords[1], 4], [coords[0], coords[3], 6]]
          : Array.from({length: coords.length / 2}, (_, index) => [coords[index * 2], coords[index * 2 + 1], index * 2])
        for(const [x, y, vertex] of points) {
          const handle = document.createElementNS("http://www.w3.org/2000/svg", "ellipse")
          handle.setAttribute("cx", String(x)); handle.setAttribute("cy", String(y))
          handle.setAttribute("rx", String(4.5 * geometry.coordinateWidth / geometry.width))
          handle.setAttribute("ry", String(4.5 * geometry.coordinateHeight / geometry.height))
          handle.classList.add("handle")
          this.shapeAreas.set(handle, area); this.handleVertices.set(handle, vertex)
          handles.push(handle)
        }
      }
      return [element, ...handles]
    })
    group.replaceChildren(...shapes)
    this.renderControls(geometry)
  }

  private renderControls(geometry: ImageMapGeometry) {
    const areas = new Set(Array.from(this.map?.querySelectorAll("area") ?? []))
    for(const [area, control] of this.areaControls) {
      if(!areas.has(area)) { control.remove(); this.areaControls.delete(area) }
    }
    for(const [index, area] of Array.from(areas).entries()) {
      const bounds = this.image ? imageMapHotspotBounds(area, this.image) : null
      if(!bounds) continue
      let control = this.areaControls.get(area)
      if(!control) {
        control = document.createElement("div")
        control.className = "actions"
        control.innerHTML = `<div class="action-buttons"><button class="link" type="button" aria-label="Edit hotspot link" title="Link">${linkIcon}</button><button class="popover" type="button" aria-label="Edit hotspot popover" title="Popover">${messageCircle}</button></div><form class="url-editor" novalidate hidden><input type="url" aria-label="Hotspot URL" placeholder="https://…"></form>`
        const input = control.querySelector<HTMLInputElement>("input")!
        const form = control.querySelector<HTMLFormElement>("form")!
        let expected: Record<string, string> | null = null
        const select = () => {
          this.selectedArea = area
          const current = this.image ? imageMapGeometry(this.image) : null
          if(current) this.renderAreas(current)
        }
        control.addEventListener("pointerdown", event => { event.stopPropagation(); select() })
        control.addEventListener("focusin", select)
        control.querySelector<HTMLButtonElement>(".link")!.addEventListener("click", event => {
          event.preventDefault()
          if(!area.isConnected || !this.onAction?.(area, stateAttributes(area), "link")) return
          form.hidden = !form.hidden
          expected = stateAttributes(area)
          input.value = area.getAttribute("href") ?? ""
          if(!form.hidden) input.focus({preventScroll:true})
        })
        control.querySelector<HTMLButtonElement>(".popover")!.addEventListener("click", event => {
          event.preventDefault()
          form.hidden = true
          if(area.isConnected) this.onAction?.(area, stateAttributes(area), "popover")
        })
        const commit = () => {
          if(expected && area.isConnected && this.onAction?.(area, expected, "link", input.value)) expected = stateAttributes(area)
        }
        input.addEventListener("change", commit)
        form.addEventListener("submit", event => { event.preventDefault(); commit(); form.hidden = true; this.element.focus({preventScroll:true}) })
        input.addEventListener("keydown", event => {
          event.stopPropagation()
          if(event.key === "Enter") {
            event.preventDefault()
            commit()
            form.hidden = true
            this.element.focus({preventScroll:true})
          }
          else if(event.key === "Escape") { form.hidden = true; this.element.focus({preventScroll:true}) }
        })
        this.root.append(control)
        this.areaControls.set(area, control)
      }
      control.setAttribute("role", "group")
      control.setAttribute("aria-label", `Hotspot ${index + 1}`)
      const size = Math.max(44, Math.min(64, bounds.width - 8, bounds.height * 2 - 8))
      Object.assign(control.style, {left:`${(bounds.left + bounds.right) / 2 - geometry.left}px`, top:`${(bounds.top + bounds.bottom) / 2 - geometry.top}px`, width:`${size}px`})
      const viewportWidth = document.defaultView!.innerWidth
      const panelWidth = Math.max(0, Math.min(240, Math.max(120, viewportWidth * .28), viewportWidth - 16))
      const center = (bounds.left + bounds.right) / 2
      const panelLeft = Math.max(8, Math.min(center - panelWidth / 2, viewportWidth - panelWidth - 8))
      Object.assign(control.querySelector<HTMLElement>(".url-editor")!.style,
        {width:`${panelWidth}px`, left:`${panelLeft - center + size / 2}px`, transform:"none",
          top:(bounds.top + bounds.bottom) / 2 + 60 > document.defaultView!.innerHeight ? "-44px" : "calc(100% + 4px)"})
      control.querySelector<HTMLElement>(".action-buttons")!.style.height = `${Math.max(24, Math.min(28, bounds.height - 4))}px`
      const popover = Boolean(area.getAttribute("popovertarget") || area.getAttribute("interestfor"))
      control.querySelector(".link")!.setAttribute("aria-pressed", String(!popover))
      const button = control.querySelector<HTMLButtonElement>(".popover")!
      button.setAttribute("aria-pressed", String(popover))
      const id = area.getAttribute("popovertarget") ?? area.getAttribute("interestfor") ?? area.getAttribute("aria-details")?.split(/\s+/).find(id => document.getElementById(id)?.hasAttribute("popover"))
      button.popoverTargetElement = id ? document.getElementById(id) : null
      button.setAttribute("aria-expanded", String(Boolean(button.popoverTargetElement?.matches(":popover-open"))))
    }
  }

  private renderPreview() {
    const group = this.root.querySelector<SVGElement>(".preview-layer")!
    const elements: SVGElement[] = []
    if(this.session?.shape === "poly") {
      if(this.polygonPoints.length) {
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
        polygon.setAttribute("points", this.polygonPoints.map(point => point.join(",")).join(" "))
        polygon.classList.add("preview")
        elements.push(polygon)
        this.polygonPoints.forEach(([x, y]) => {
          const vertex = document.createElementNS("http://www.w3.org/2000/svg", "circle")
          vertex.setAttribute("cx", String(x))
          vertex.setAttribute("cy", String(y))
          vertex.setAttribute("r", "4")
          vertex.classList.add("vertex")
          elements.push(vertex)
        })
      }
    }
    else {
      const coords = this.currentShapeCoordinates()?.split(",").map(Number)
      if(coords && this.session?.shape === "rect") {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        rect.setAttribute("x", String(coords[0]))
        rect.setAttribute("y", String(coords[1]))
        rect.setAttribute("width", String(coords[2] - coords[0]))
        rect.setAttribute("height", String(coords[3] - coords[1]))
        rect.classList.add("preview")
        elements.push(rect)
      }
      else if(coords && this.session?.shape === "circle") {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
        circle.setAttribute("cx", String(coords[0]))
        circle.setAttribute("cy", String(coords[1]))
        circle.setAttribute("r", String(coords[2]))
        circle.classList.add("preview")
        elements.push(circle)
      }
    }
    group.replaceChildren(...elements)
  }
}

/** A transparent appendix surface that turns the first interaction with an
 * authored media element into an editor capture. Keeping the surface mounted
 * through click prevents the media's native activation from leaking through;
 * the following click reaches the media after capture has been released. */
class MediaInteractionShield {
  readonly element = document.createElement("div")
  private target: Element | null = null
  private onActivate: ((target: Element, event: PointerEvent) => void) | null = null
  private onFinish: ((target: Element) => void) | null = null
  private pointerUpSeen = false

  constructor(
    onActivate: (target: Element, event: PointerEvent) => void,
    onFinish: (target: Element) => void,
  ) {
    this.onActivate = onActivate
    this.onFinish = onFinish
    this.element.classList.add("◆", "◆editor-only", "◆media-interaction-shield")
    this.element.contentEditable = "false"
    this.element.setAttribute("part", "media-interaction-shield")
    this.element.setAttribute("aria-hidden", "true")
    const root = this.element.attachShadow({mode: "open"})
    root.innerHTML = worldWww
    adoptStylesheet(root, mediaInteractionShieldStylesheet)
    this.element.addEventListener("pointerdown", this.handlePointerDown)
    this.element.addEventListener("pointerup", this.handlePointerUp)
    this.element.addEventListener("pointercancel", this.handlePointerCancel)
    this.element.addEventListener("lostpointercapture", this.handleLostPointerCapture)
    this.element.addEventListener("click", this.handleClick)
  }

  setTarget(target: Element) {
    this.target = target
    this.element.toggleAttribute("data-empty-website", isWebsiteType(target.localName) && isEmptyMedia(target))
    const rect = target.getBoundingClientRect()
    Object.assign(this.element.style, {
      left: `${fixedClientX(rect.left)}px`,
      top: `${rect.top}px`,
      width: `${Math.max(0, rect.width)}px`,
      height: `${Math.max(0, rect.height)}px`,
    })
    this.element.hidden = rect.width <= 0 || rect.height <= 0
  }

  get media() {
    return this.target
  }

  remove() {
    this.target = null
    this.element.remove()
  }

  private stop(event: Event) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  private handlePointerDown = (event: PointerEvent) => {
    if(event.button !== 0 || !this.target) return
    this.stop(event)
    this.pointerUpSeen = false
    try {
      this.element.setPointerCapture?.(event.pointerId)
    }
    catch {
      // Synthetic events and disconnected overlays cannot acquire capture.
    }
    this.onActivate?.(this.target, event)
  }

  private handlePointerUp = (event: PointerEvent) => {
    if(!this.target) return
    this.stop(event)
    this.pointerUpSeen = true
    // Keep the shield until click so a browser-generated activation cannot
    // retarget the newly captured media during the same pointer sequence.
  }

  private handlePointerCancel = (event: PointerEvent) => {
    if(!this.target) return
    this.stop(event)
    this.onFinish?.(this.target)
  }

  private handleLostPointerCapture = (event: Event) => {
    if(!this.target || this.pointerUpSeen) return
    this.stop(event)
    this.onFinish?.(this.target)
  }

  private handleClick = (event: MouseEvent) => {
    if(!this.target) return
    this.stop(event)
    this.onFinish?.(this.target)
  }
}

/** Media insertion and editing. Empty media are marked only with editor
 * classes; their interactive UI lives in the BODY shadow appendix. */
export class MediaFeature extends EditorFeature {
  private observer: MutationObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private refreshQueued = false
  private mediaPlaceholder: MediaPlaceholder | null = null
  private mediaCapture: {controller: MediaCapture, valid: () => boolean} | null = null
  private readonly sourceLabels = new WeakMap<Element, Map<string, {label: string, kind: "file" | "capture" | "recording"}>>()
  private pendingFile: {picker: HTMLInputElement} | null = null
  private cancelSourceFile() {
    const pending = this.pendingFile
    this.pendingFile = null
    pending?.picker.remove()
  }

  private rememberSource(element: Element, source: string, label: string, kind: "file" | "capture" | "recording") {
    let labels = this.sourceLabels.get(element)
    if(!labels) this.sourceLabels.set(element, labels = new Map())
    labels.set(source, {label, kind})
  }

  private sourceSnapshot(element: Element) {
    return JSON.stringify([stateAttributes(mediaSourceTarget(element, false)),
      Array.from(element.querySelectorAll("source")).map(source => stateAttributes(source))])
  }

  private imageMapOverlayController: ImageMapOverlay | null = null
  private popoverController: ReturnType<typeof createImageMapPopoverController> | null = null
  private get popovers() {
    return this.popoverController ??= createImageMapPopoverController(document)
  }
  private readonly interactionShields = new Map<Element, MediaInteractionShield>()
  private readonly graphicImagePlaceholders = new Map<SVGGraphicsElement, HTMLDivElement>()
  private readonly observedGraphicImageTargets = new Set<Element>()
  private readonly shieldReleasePending = new Set<Element>()
  private readonly observedShieldTargets = new Set<Element>()
  private bodyResizeObserved = false

  get isPlaceholderInteraction() {
    return this.mediaPlaceholder?.isInteracting ?? false
  }

  get placeholder() {
    if(!this.mediaPlaceholder) {
      this.mediaPlaceholder = new MediaPlaceholder(this.editor.schema)
      this.mediaPlaceholder.onSource = (target, source, fileName) => {
        const url = typeof source === "string" ? source : this.editor.createMediaURL(source)
        if(fileName) this.rememberSource(target, url, fileName, "file")
        this.setSource(target, url)
      }
      this.mediaPlaceholder.onCapture = (target, mode) => this.openCapture(target, mode)
      this.mediaPlaceholder.onFocus = target => {
        if(!document.body.contains(target) || !isEmptyMedia(target)) return
        if(!isGraphicImage(target)) this.editor.features.selection.captureElement(target, {preserveNativeSelection: true})
        this.editor.postSelectionPath()
      }
      this.mediaPlaceholder.onInteractionChange = this.scheduleRefresh
      this.editor.addAppendix(this.mediaPlaceholder.element)
    }
    return this.mediaPlaceholder
  }

  get imageMapOverlay() {
    if(!this.imageMapOverlayController) {
      this.imageMapOverlayController = new ImageMapOverlay()
      this.imageMapOverlayController.onCommit = (session, coords) => this.commitImageMapArea(session, coords)
      this.imageMapOverlayController.onEdit = (area, expected, coords) => {
        if(!this.isEnabled || this.editor.isEditingLocked || !area.isConnected || !equalAttributes(area, expected)) return false
        this.editor.doc.stopCapturing()
        area.setAttribute("coords", coords)
        this.finishImageMapChange()
        return true
      }
      const prepare = (area: HTMLAreaElement, expected: Record<string, string>) => {
        const image = this.imageMapOverlayController?.image
        const map = this.imageMapOverlayController?.map
        if(!this.isEnabled || this.editor.isEditingLocked || !image?.isConnected || !map?.contains(area)
          || this.associatedImageMap(image) !== map || !equalAttributes(area, expected)) return null
        this.editor.features.selection.captureElement(mediaContainerForNode(image) ?? image)
        return pathFromNode(map, area)
      }
      this.imageMapOverlayController.onRemove = (area, expected) => {
        const path = prepare(area, expected)
        return path ? this.actions.removeImageMapArea({type: "removeImageMapArea", path, expected}) : false
      }
      this.imageMapOverlayController.onAction = (area, expected, kind, value) => {
        const path = prepare(area, expected)
        if(!path) return false
        if(kind === "popover") return this.actions.addImageMapPopover({type:"addImageMapPopover", path, expected})
        const id = area.getAttribute("popovertarget") ?? area.getAttribute("interestfor")
        if(id) {
          const content = document.getElementById(id)
          try { content?.hidePopover?.() } catch {}
          const details = area.getAttribute("aria-details")?.split(/\s+/).filter(Boolean) ?? []
          if(!details.includes(id)) area.setAttribute("aria-details", [...details, id].join(" "))
          area.removeAttribute("popovertarget")
          area.removeAttribute("interestfor")
          if(area.getAttribute("href") === `#${id}`) area.removeAttribute("href")
        }
        if(value !== undefined) value ? area.setAttribute("href", value) : area.removeAttribute("href")
        this.finishImageMapChange()
        return true
      }
      this.editor.addAppendix(this.imageMapOverlayController.element)
    }
    return this.imageMapOverlayController
  }

  private isShieldEligible(element: Element) {
    const style = getComputedStyle(element)
    if(!element.matches("iframe, audio, video, embed, object")
      || !element.isConnected
      // Empty frames and native media controls can consume pointer events
      // before they reach the document's empty-media pointer handler.
      || isEmptyMedia(element) && !element.matches("iframe, embed, object, audio[controls], video[controls]")
      || element.hasAttribute("hidden")
      || style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      // Hidden disclosure content can retain a box without being rendered.
      || element.checkVisibility?.() === false
      || atomicEditingContainer(element.parentElement, this.editor.schema)
      || element.parentElement?.closest(mediaSelector)) return false
    return true
  }

  private shouldShield(element: Element) {
    if(!this.isShieldEligible(element)) return false
    const selection = this.editor.features.selection
    return isEmptyMedia(element) || selection.captureSelectedElement !== element
  }

  private releaseShield = (target: Element) => {
    this.shieldReleasePending.delete(target)
    this.scheduleRefresh()
  }

  private activateShield = (target: Element) => {
    if(!this.isShieldEligible(target)) {
      this.releaseShield(target)
      return
    }
    this.shieldReleasePending.clear()
    this.shieldReleasePending.add(target)
    this.editor.features.selection.captureElement(target)
    this.editor.postSelectionPath()
    this.refresh()
  }

  private syncInteractionShields() {
    this.shieldReleasePending.forEach(target => {
      if(!this.isShieldEligible(target)) this.shieldReleasePending.delete(target)
    })
    const desired = new Set<Element>()
    document.querySelectorAll<Element>("iframe, audio, video, embed, object").forEach(element => {
      if(this.shouldShield(element) || this.shieldReleasePending.has(element)) desired.add(element)
    })

    this.interactionShields.forEach((shield, target) => {
      if(!desired.has(target)) {
        shield.remove()
        this.interactionShields.delete(target)
        this.resizeObserver?.unobserve(target)
        this.observedShieldTargets.delete(target)
      }
    })
    desired.forEach(target => {
      let shield = this.interactionShields.get(target)
      if(!shield) {
        shield = new MediaInteractionShield(this.activateShield, this.releaseShield)
        this.interactionShields.set(target, shield)
        this.editor.addAppendix(shield.element)
      }
      shield.setTarget(target)
    })

    if(this.resizeObserver) {
      if(!this.bodyResizeObserved) {
        this.resizeObserver.observe(document.body)
        this.bodyResizeObserved = true
      }
      desired.forEach(target => {
        if(this.observedShieldTargets.has(target)) return
        this.resizeObserver!.observe(target)
        this.observedShieldTargets.add(target)
      })
    }
  }

  private syncGraphicImagePlaceholders() {
    const desired = new Set<SVGGraphicsElement>()
    document.querySelectorAll<SVGGraphicsElement>("svg image").forEach(image => {
      if(isGraphicImage(image) && isEmptyMedia(image) && !sourceEditingBlocked(image, this.editor.schema)) desired.add(image)
    })
    this.graphicImagePlaceholders.forEach((placeholder, image) => {
      if(desired.has(image)) return
      placeholder.remove()
      this.graphicImagePlaceholders.delete(image)
    })
    desired.forEach(image => {
      let placeholder = this.graphicImagePlaceholders.get(image)
      if(!placeholder) {
        placeholder = document.createElement("div")
        placeholder.classList.add("◆", "◆editor-only", "◆graphic-image-placeholder")
        placeholder.contentEditable = "false"
        placeholder.setAttribute("part", "graphic-image-placeholder")
        placeholder.setAttribute("aria-hidden", "true")
        placeholder.textContent = "Add an image"
        this.graphicImagePlaceholders.set(image, placeholder)
        this.editor.addAppendix(placeholder)
      }
      const rect = image.getBoundingClientRect()
      if(rect.width > 0 && rect.height > 0 && (rect.width < 64 || rect.height < 28)) {
        placeholder.innerHTML = photo
        const icon = placeholder.querySelector<SVGSVGElement>("svg")!
        icon.style.cssText = "width:18px;height:18px;max-width:100%;max-height:100%;min-width:0;min-height:0"
      }
      else placeholder.textContent = "Add an image"
      const style = getComputedStyle(image)
      placeholder.hidden = rect.width <= 0 || rect.height <= 0
        || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"
      if(placeholder.hidden) return
      Object.assign(placeholder.style, {
        left: `${fixedClientX(rect.left)}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`, transform: "none",
      })
      // Preserve native SVG transforms, including those on unfamiliar groups.
      // DOM shims without SVG geometry APIs use the bounding rectangle above.
      const box = image.getBBox?.()
      const matrix = image.getScreenCTM?.()
      if(box && matrix && box.width > 0 && box.height > 0) {
        const widthScale = Math.hypot(matrix.a, matrix.b)
        const heightScale = Math.hypot(matrix.c, matrix.d)
        if(!widthScale || !heightScale) return
        const x = matrix.a * box.x + matrix.c * box.y + matrix.e
        const y = matrix.b * box.x + matrix.d * box.y + matrix.f
        // Keep the caption and dashed border the same size as HTML images,
        // while following SVG rotation, skew and editor zoom.
        Object.assign(placeholder.style, {
          left: `${fixedClientX(0)}px`, top: "0", width: `${box.width * widthScale}px`, height: `${box.height * heightScale}px`,
          transform: `matrix(${matrix.a / widthScale}, ${matrix.b / widthScale}, ${matrix.c / heightScale}, ${matrix.d / heightScale}, ${x}, ${y})`,
        })
      }
    })
    if(this.resizeObserver) {
      const observed = new Set<Element>(desired)
      desired.forEach(image => {
        for(let owner = image.ownerSVGElement; owner; owner = owner.ownerSVGElement) observed.add(owner)
      })
      this.observedGraphicImageTargets.forEach(target => {
        if(observed.has(target)) return
        this.resizeObserver!.unobserve(target)
        this.observedGraphicImageTargets.delete(target)
      })
      observed.forEach(target => {
        if(this.observedGraphicImageTargets.has(target)) return
        this.resizeObserver!.observe(target)
        this.observedGraphicImageTargets.add(target)
      })
    }
  }

  private cancelPendingShield = () => {
    if(!this.shieldReleasePending.size) return
    this.shieldReleasePending.clear()
    this.scheduleRefresh()
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const FrameMutationObserver = document.defaultView?.MutationObserver
    if(FrameMutationObserver) {
      this.observer = new FrameMutationObserver(() => this.scheduleRefresh())
      try {
        this.observer.observe(document.body, {subtree: true, childList: true, attributes: true})
      }
      catch {
        // Scoped-registry startup can briefly pair the iframe document with a
        // MutationObserver from the document being replaced. Explicit media
        // operations still refresh synchronously, so observation is optional.
        this.observer.disconnect()
        this.observer = null
      }
    }
    const FrameResizeObserver = document.defaultView?.ResizeObserver
    if(FrameResizeObserver) this.resizeObserver = new FrameResizeObserver(this.scheduleRefresh)
    window.addEventListener("resize", this.scheduleRefresh)
    window.addEventListener("blur", this.cancelPendingShield)
    document.addEventListener("scroll", this.scheduleRefresh, true)
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    const capture = this.mediaCapture
    this.mediaCapture = null
    capture?.controller.close()
    this.observer?.disconnect()
    this.observer = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.observedShieldTargets.clear()
    this.observedGraphicImageTargets.clear()
    this.bodyResizeObserved = false
    window.removeEventListener("resize", this.scheduleRefresh)
    window.removeEventListener("blur", this.cancelPendingShield)
    document.removeEventListener("scroll", this.scheduleRefresh, true)
    this.cancelSourceFile()
    this.mediaPlaceholder?.dispose()
    this.mediaPlaceholder = null
    this.popoverController?.dispose()
    this.popoverController = null
    this.imageMapOverlayController?.element.remove()
    this.imageMapOverlayController = null
    this.interactionShields.forEach(shield => shield.remove())
    this.interactionShields.clear()
    this.graphicImagePlaceholders.forEach(placeholder => placeholder.remove())
    this.graphicImagePlaceholders.clear()
    this.shieldReleasePending.clear()
    document.querySelectorAll(".◆media-empty").forEach(element => this.setEmptyMarker(element, false))
    super.disable()
  }

  passiveListeners = {
    selectionchange: () => this.scheduleRefresh(),
    pointerover: (event: PointerEvent) => this.popovers.handleEvent(event),
  }

  activeListeners = {
    click: (event: MouseEvent) => this.popovers.handleEvent(event),
    pointerdown: (event: PointerEvent) => {
      const target = event.target instanceof Node ? mediaContainerForNode(event.target) : null
      if(!target || !isEmptyMedia(target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.editor.features.selection.captureElement(target)
      this.editor.postSelectionPath()
      this.refresh()
    },
  }

  mediaDropTarget(event: DragEvent) {
    if(this.editor.isEditingLocked || isWidgetShadowInteraction(event, this.editor.schema)) return null
    const path = event.composedPath()
    let target = this.mediaPlaceholder && path.includes(this.mediaPlaceholder.element) ? this.mediaPlaceholder.target : null
    for(const [media, shield] of this.interactionShields) {
      if(path.includes(shield.element)) target = media
    }
    for(const [image, placeholder] of this.graphicImagePlaceholders) {
      if(path.includes(placeholder)) target = image
    }
    if(!target && event.target instanceof Node) target = mediaContainerForNode(event.target)
    return target && document.body.contains(target) && !sourceEditingBlocked(target, this.editor.schema) ? target : null
  }

  private setFile(element: Element, file: Blob, attribute?: "poster") {
    if(!this.isEnabled || this.editor.isEditingLocked || !document.body.contains(element)
      || sourceEditingBlocked(element, this.editor.schema) || attribute && (attribute !== "poster" || !element.matches("video"))) return false
    const source = this.editor.createMediaURL(file)
    this.rememberSource(element, source, file instanceof File ? file.name : "Media file", "file")
    this.editor.doc.stopCapturing()
    const changed = this.setSource(element, source, true, attribute)
    this.editor.doc.stopCapturing()
    return changed
  }

  captureListeners = {
    dragover: (event: DragEvent) => {
      const data = event.dataTransfer
      if(!data || !this.mediaDropTarget(event) || !data.types.includes("Files") && !Array.from(data.items).some(item => item.kind === "file")) return
      event.preventDefault()
      event.stopImmediatePropagation()
      data.dropEffect = "copy"
    },
    drop: (event: DragEvent) => {
      const target = this.mediaDropTarget(event)
      const file = event.dataTransfer?.files[0]
      if(!target || !file) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.setFile(target, file)
    },
  }

  actions = {
    setMediaFile: ({file, attribute}: {type: "setMediaFile", file: Blob, attribute?: "poster"}) => {
      const element = this.selectedMedia()
      return element && file instanceof Blob ? this.setFile(element, file, attribute) : false
    },
    setMediaCrop: ({crop}: {type: "setMediaCrop", crop: import("../editor-bridge").ElementStyleMutation}) => {
      if(!this.isEnabled) return false
      const media = this.selectedMedia()
      const target = media ? this.cropTargetFor(media) : null
      if(!target || typeof CSS.supports === "function" && !CSS.supports("object-view-box", "inset(0%)")) return false
      const changed = this.editor.features.manipulation.setElementStyles(target, {"object-view-box": crop})
      this.refresh()
      return changed
    },
    selectMediaFile: ({attribute}: {type: "selectMediaFile", attribute?: "poster"}) => {
      const element = this.selectedMedia()
      if(!this.isEnabled || !element || attribute && !element.matches("video") || sourceEditingBlocked(element, this.editor.schema)) return false
      this.cancelSourceFile()
      const snapshot = this.sourceSnapshot(element)
      const sourceTarget = mediaSourceTarget(element, false)
      const picker = document.createElement("input")
      picker.type = "file"
      picker.hidden = true
      picker.accept = attribute === "poster" || element.matches("picture, img") ? "image/*" : element.matches("audio") ? "audio/*"
        : element.matches("video") ? "video/*" : ".html,.htm,text/html"
      const pending = {picker}
      this.pendingFile = pending
      const valid = () => this.pendingFile === pending && this.isEnabled && document.body.contains(element)
        && !sourceEditingBlocked(element, this.editor.schema) && snapshot === this.sourceSnapshot(element)
        && sourceTarget === mediaSourceTarget(element, false)
      picker.addEventListener("cancel", () => { if(this.pendingFile === pending) this.cancelSourceFile() }, {once: true})
      picker.addEventListener("change", () => {
        const file = picker.files?.[0]
        if(!valid() || !file) { if(this.pendingFile === pending) this.cancelSourceFile(); return }
        this.setFile(element, file, attribute)
        this.cancelSourceFile()
      }, {once: true})
      this.editor.addAppendix(picker)
      picker.click()
      return true
    },
    captureSelectedMedia: ({mode, attribute}: {type: "captureSelectedMedia", mode: MediaCaptureMode, attribute?: "poster"}) => {
      const element = this.selectedMedia()
      return this.isEnabled && element && isMediaCaptureMode(mode) ? this.openCapture(element, mode, true, attribute) : false
    },
    removeMediaSource: ({}: {type: "removeMediaSource"}) => {
      const element = this.selectedMedia()
      if(!element || sourceEditingBlocked(element, this.editor.schema)) return false
      const target = mediaSourceTarget(element, false)
      target.removeAttribute(mediaSourceAttribute(target))
      target.removeAttribute("srcset")
      if(element.matches("iframe")) element.removeAttribute("srcdoc")
      if(element.matches("picture, audio, video")) {
        Array.from(element.children).filter(child => child.localName === "source").forEach(source => {
          source.removeAttribute(element.localName === "picture" ? "srcset" : "src")
        })
      }
      this.refresh()
      this.editor.postSelectionPath()
      return true
    },
    captureMedia: ({mode}: {type: "captureMedia", mode: MediaCaptureMode}) => {
      if(!this.isEnabled || !isMediaCaptureMode(mode)) return false
      this.actions.insertMedia({type: "insertMedia", media: mediaCaptureModes[mode].media})
      const target = this.selectedMedia()
      return target ? this.openCapture(target, mode) : false
    },
    cancelMediaCapture: ({}: {type: "cancelMediaCapture"}) => {
      this.mediaCapture?.controller.close()
    },
    insertMedia: ({media, selectFile = false}: {type: "insertMedia", media: MediaType, selectFile?: boolean}) => {
      if(!isMediaType(media)) throw new TypeError(`Unsupported media type '${String(media)}'`)
      media = media === "img" ? "picture" : isWebsiteType(media) ? "iframe" : media
      const template = document.createElement("template")
      template.innerHTML = mediaDefaultHTML(media)
      const element = template.content.firstElementChild!
      this.editor.features.manipulation.insert(template.content, 0, false, (this.editor.features.canvas.active || this.editor.features.slides.active) || undefined)
      if(element.isConnected) {
        this.editor.features.selection.captureElement(element)
      }
      this.refresh()
      if(selectFile && this.placeholder.target === element) this.placeholder.selectFile()
    },
    setMediaAttribute: ({name, value}: {type: "setMediaAttribute", name: string, value: string | null}) => {
      const element = this.selectedMedia()
      if(!element || !mediaAttributeOptions[element.localName as MediaType].some(option => option.name === name)) {
        throw new TypeError(`Attribute '${name}' is not editable for the selected media`)
      }
      const target = mediaSourceTarget(element)
      value === null ? target.removeAttribute(name) : target.setAttribute(name, value)
      this.refresh()
    },
    addTimedMediaResource: ({resource}: {type: "addTimedMediaResource", resource: TimedMediaResourceType}) => {
      if(!isTimedMediaResourceType(resource)) throw new TypeError(`Unsupported media resource '${String(resource)}'`)
      const media = this.selectedTimedMedia()
      if(!media) return false
      const element = document.createElement(resource)
      if(resource === "track") element.setAttribute("kind", "subtitles")
      const resources = this.directResources(media, resource)
      const reference = resources.at(-1)?.nextSibling
        ?? (resource === "source" ? this.directResources(media, "track")[0] : null)
        ?? Array.from(media.childNodes).find(node => !isTimedResourceElement(node))
        ?? null
      media.insertBefore(element, reference)
      this.finishTimedMediaChange()
      return true
    },
    setTimedMediaResourceAttribute: ({resource, index, expected, name, value}: {
      type: "setTimedMediaResourceAttribute"
      resource: TimedMediaResourceType
      index: number
      expected: Record<string, string>
      name: string
      value: string | null
    }) => {
      const target = this.timedMediaResource(resource, index, expected)
      if(!target || !timedMediaResourceAttributeOptions[resource].some(option => option.name === name)) return false
      value === null ? target.removeAttribute(name) : target.setAttribute(name, value)
      this.finishTimedMediaChange()
      return true
    },
    moveTimedMediaResource: ({resource, index, expected, direction}: {
      type: "moveTimedMediaResource"
      resource: TimedMediaResourceType
      index: number
      expected: Record<string, string>
      direction: -1 | 1
    }) => {
      if(direction !== -1 && direction !== 1) throw new TypeError("Media resources can only move up or down")
      const target = this.timedMediaResource(resource, index, expected)
      const media = this.selectedTimedMedia()
      if(!target || !media || target.parentElement !== media) return false
      const resources = this.directResources(media, resource)
      const position = resources.indexOf(target)
      const neighbour = resources[position + direction]
      if(!neighbour) return false
      if(direction < 0) media.insertBefore(target, neighbour)
      else media.insertBefore(target, neighbour.nextSibling)
      this.finishTimedMediaChange()
      return true
    },
    removeTimedMediaResource: ({resource, index, expected}: {
      type: "removeTimedMediaResource"
      resource: TimedMediaResourceType
      index: number
      expected: Record<string, string>
    }) => {
      const target = this.timedMediaResource(resource, index, expected)
      if(!target) return false
      target.remove()
      this.finishTimedMediaChange()
      return true
    },
    setTimedMediaFallbackHTML: ({html, expected}: {
      type: "setTimedMediaFallbackHTML"
      html: string
      expected: string
    }) => {
      if(typeof html !== "string" || typeof expected !== "string") throw new TypeError("Media fallback content must be HTML")
      if(html.length > maximumMediaFallbackLength) throw new RangeError("Media fallback content is too large")
      const media = this.selectedTimedMedia()
      if(!media || this.fallbackHTML(media) !== expected) return false
      const template = document.createElement("template")
      template.innerHTML = html
      this.editor.clearEditingArtifacts(template.content)
      const removedUnsafeItems = stripActiveContent(template.content, {unwrapUnsupportedElements: true})
      const fragment = template.content
      if(fragment.querySelector("source, track, audio, video")) {
        throw new TypeError("Media fallback content cannot contain media resources or nested timed media")
      }
      Array.from(media.childNodes)
        .filter(node => !isTimedResourceElement(node))
        .forEach(node => node.remove())
      media.append(fragment)
      this.finishTimedMediaChange()
      return {changed: true, removedUnsafeItems}
    },
    addImageMap: ({shape}: {type: "addImageMap", shape?: ImageMapHotspotShape}) => {
      if(shape && !isImageMapHotspotShape(shape)) return false
      const image = this.selectedImage(true)
      if(!image || this.associatedImageMap(image)) return false
      const authoredName = image.getAttribute("usemap")?.trim()
      const requestedName = authoredName?.startsWith("#") ? authoredName.slice(1).trim() : ""
      const name = requestedName || this.uniqueImageMapName()
      const map = document.createElement("map")
      map.setAttribute("name", name)
      const media = mediaContainerForNode(image) ?? image
      let anchor: Element = media
      if(anchor.parentElement?.matches("a")) anchor = anchor.parentElement
      if(!anchor.parentNode) return false
      anchor.after(map)
      image.setAttribute("usemap", `#${name}`)
      this.finishImageMapChange()
      if(shape) {
        this.imageMapOverlay.showFor(image, map)
        this.imageMapOverlay.startDrawing(shape)
      }
      return true
    },
    removeImageMap: ({}: {type: "removeImageMap"}) => {
      const image = this.selectedImage(false)
      const map = image ? this.associatedImageMap(image) : null
      if(!image || !map) return false
      image.removeAttribute("usemap")
      const shared = this.imagesUsingMap(map).length > 0
      if(!shared) map.remove()
      this.finishImageMapChange()
      return {removedMap: !shared}
    },
    startImageMapDrawing: ({shape}: {type: "startImageMapDrawing", shape: ImageMapHotspotShape}) => {
      if(!isImageMapHotspotShape(shape)) throw new TypeError(`Unsupported hotspot shape '${String(shape)}'`)
      const image = this.selectedImage(false)
      const map = image ? this.associatedImageMap(image) : null
      if(!image) return false
      if(!map) {
        const pending = document.createElement("map")
        pending.setAttribute("name", this.uniqueImageMapName())
        this.imageMapOverlay.showFor(image, pending)
        return this.imageMapOverlay.startDrawing(shape, true)
      }
      this.imageMapOverlay.showFor(image, map)
      return this.imageMapOverlay.startDrawing(shape)
    },
    setImageMapAreaAttribute: ({path, expected, name, value}: {
      type: "setImageMapAreaAttribute"
      path: number[]
      expected: Record<string, string>
      name: string
      value: string | null
    }) => {
      const area = this.selectedImageMapArea(path, expected)
      if(!area || !imageMapAreaAttributeOptions.some(option => option.name === name)) return false
      value === null ? area.removeAttribute(name) : area.setAttribute(name, value)
      this.finishImageMapChange()
      return true
    },
    removeImageMapArea: ({path, expected}: {
      type: "removeImageMapArea"
      path: number[]
      expected: Record<string, string>
    }) => {
      const area = this.selectedImageMapArea(path, expected)
      if(!area) return false
      const image = this.selectedImage(false)
      const map = image ? this.associatedImageMap(image) : null
      const id = area.getAttribute("popovertarget") ?? area.getAttribute("interestfor")
      try { if(id) document.getElementById(id)?.hidePopover?.() } catch {}
      area.remove()
      if(map && !map.querySelector("area")) {
        this.imagesUsingMap(map).forEach(image => image.removeAttribute("usemap"))
        // Removing the map must not discard unrelated authored children.
        map.replaceWith(...map.childNodes)
      }
      this.finishImageMapChange()
      return true
    },
    addImageMapPopover: ({path, expected}: {type: "addImageMapPopover", path: number[], expected: Record<string, string>}) => {
      const area = this.selectedImageMapArea(path, expected)
      if(!area) return false
      if(area.hasAttribute("popovertarget") || area.hasAttribute("interestfor")) return this.openAreaPopover(area)
      const retained = area.getAttribute("aria-details")?.split(/\s+/).find(id => document.getElementById(id)?.hasAttribute("popover"))
      if(retained) {
        area.setAttribute("popovertarget", retained)
        if(!area.hasAttribute("href")) area.setAttribute("href", `#${retained}`)
        this.finishImageMapChange()
        return this.openAreaPopover(area)
      }
      let id = "hotspot-popover", suffix = 2
      while(document.getElementById(id)) id = `hotspot-popover-${suffix++}`
      const content = document.createElement("div")
      content.id = id
      content.setAttribute("popover", "auto")
      const paragraph = document.createElement("p")
      paragraph.textContent = "Popover content"
      content.append(paragraph)
      area.closest("map")!.after(content)
      area.setAttribute("popovertarget", id)
      area.setAttribute("aria-details", [area.getAttribute("aria-details"), id].filter(Boolean).join(" "))
      // An AREA without href is inert in native image-map hit testing.
      if(!area.hasAttribute("href")) area.setAttribute("href", `#${id}`)
      this.finishImageMapChange()
      return this.openAreaPopover(area)
    },
    openImageMapPopover: ({path, expected}: {type: "openImageMapPopover", path: number[], expected: Record<string, string>}) => {
      const area = this.selectedImageMapArea(path, expected)
      return area ? this.openAreaPopover(area) : false
    },
    setImageMapPopoverTrigger: ({path, expected, value}: {
      type: "setImageMapPopoverTrigger", path: number[], expected: Record<string, string>, value: "click" | "hover"
    }) => {
      if(value !== "click" && value !== "hover") return false
      const area = this.selectedImageMapArea(path, expected)
      const id = area?.getAttribute("popovertarget") ?? area?.getAttribute("interestfor")
      if(!area || !id) return false
      area.removeAttribute(value === "hover" ? "popovertarget" : "interestfor")
      area.setAttribute(value === "hover" ? "interestfor" : "popovertarget", id)
      this.finishImageMapChange()
      return true
    },
    wrapMediaInFigure: ({}: {type: "wrapMediaInFigure"}) => {
      const selected = this.selectedMedia()
      if(!selected || selected.closest("figure")) return false
      const wrapped = this.editor.features.manipulation.addSection("figure")
      if(!wrapped || !selected.isConnected) return false
      $.selectElement(selected)
      this.editor.features.selection.processSelection()
      this.refresh()
      return true
    },
    switchImageType: ({image}: {type: "switchImageType", image: "picture" | "img"}) => {
      if(image !== "picture" && image !== "img") throw new TypeError(`Unsupported image type '${String(image)}'`)
      if(image !== "picture") return
      const selected = this.selectedMedia()
      if(!selected || !selected.matches("picture, img") || selected.localName === image) return
      const replacement = document.createElement("picture")
      selected.replaceWith(replacement)
      replacement.append(selected)
      $.selectElement(replacement)
      this.editor.features.selection.processSelection()
      this.refresh()
    },
    switchWebsiteType: ({website}: {type: "switchWebsiteType", website: WebsiteType}) => {
      if(!isWebsiteType(website)) throw new TypeError(`Unsupported website type '${String(website)}'`)
      if(website !== "iframe") return
      const selected = this.selectedMedia()
      if(!selected || !isWebsiteType(selected.localName) || selected.localName === website) return

      const replacement = document.createElement(website)
      const allowed = new Set(mediaAttributeOptions[website].map(option => option.name))
      const websiteAttributes = new Set(websiteTypes.flatMap(type => mediaAttributeOptions[type].map(option => option.name)))
      const source = selected.getAttribute(mediaSourceAttribute(selected))
      Array.from(selected.attributes).forEach(attribute => {
        if(attribute.name === "class") {
          const classes = authoredClassValue(attribute.value)
          if(classes) replacement.setAttribute("class", classes)
          return
        }
        if(attribute.name === "src" || attribute.name === "data") return
        if(websiteAttributes.has(attribute.name) && !allowed.has(attribute.name)) return
        replacement.setAttribute(attribute.name, attribute.value)
      })
      if(source) replacement.setAttribute(mediaSourceAttribute(website), source)
      selected.replaceWith(replacement)
      $.selectElement(replacement)
      this.editor.features.selection.processSelection()
      this.refresh()
    },
  } as const

  getState(): MediaSelectionState | undefined {
    const element = this.selectedMedia()
    if(!element) return
    const target = mediaSourceTarget(element, false)
    const state: MediaSelectionState = {
      type: element.localName as MediaType,
      attributes: stateAttributes(target),
    }
    const source = target.getAttribute(mediaSourceAttribute(target)) || element.querySelector("source[src]")?.getAttribute("src") || ""
    state.sourceSize = this.editor.mediaSourceSize(source)
    const provenance = this.sourceLabels.get(element)?.get(source)
    if(provenance) {
      state.sourceKind = provenance.kind
      const peers = Array.from(document.body.querySelectorAll(element.matches("picture, img") ? "picture, img:not(picture > img)" : element.localName))
      state.sourceLabel = provenance.kind === "file" ? provenance.label
        : `${provenance.kind === "capture" ? "Capture" : "Recording"} ${peers.indexOf(element) + 1}`
    }
    if(element.matches("video")) {
      const poster = element.getAttribute("poster") ?? ""
      const cover = this.sourceLabels.get(element)?.get(poster)
      state.cover = {size: this.editor.mediaSourceSize(poster), ...cover,
        ...(cover ? {label: cover.label || (cover.kind === "capture" ? "Capture" : "Recording")} : {})}
    }
    if(element.matches("audio, video")) {
      state.sources = this.resourceState(element, "source")
      state.tracks = this.resourceState(element, "track")
      state.fallbackHTML = this.fallbackHTML(element)
    }
    if(element.matches("picture, img")) {
      const image = this.imageForMedia(element, false)
      const map = image ? this.associatedImageMap(image) : null
      state.imageMap = image && map ? {
        name: map.getAttribute("name") ?? "",
        shared: this.imagesUsingMap(map).some(candidate => candidate !== image),
        areas: this.imageMapAreaState(map),
      } : null
    }
    return state
  }

  private selectedMedia() {
    const selected = this.editor.features.selection.captureSelectedElement ?? $.selectedElement
    if(selected?.matches(mediaSelector)) return mediaContainerForNode(selected)
    if(selected?.localName === "figure") {
      const media = Array.from(selected.children).filter(child => child.matches(mediaSelector))
      if(media.length === 1) return mediaContainerForNode(media[0])
    }
    const container = $.anchorContainer
    return isElement(container) ? mediaContainerForNode(container) : null
  }

  /** Resolve the currently rendered native media without creating content. */
  cropTargetFor(element: Element): HTMLImageElement | HTMLVideoElement | null {
    if(element.localName === "figure") {
      const media = Array.from(element.children).filter(child => child.matches("picture, img, video"))
      if(media.length !== 1) return null
      element = media[0]
    }
    if(!this.isEnabled || !element.matches("picture, img, video") || !element.isConnected || !document.body.contains(element) || element.hasAttribute("is")) return null
    element = mediaContainerForNode(element) ?? element
    if(sourceEditingBlocked(element, this.editor.schema)) return null
    const target = mediaSourceTarget(element, false)
    if(target.localName === "video" && isEmptyMedia(target)) return null
    return target.matches("img, video") && !target.hasAttribute("is") && target.namespaceURI === htmlNamespace ? target as HTMLImageElement | HTMLVideoElement : null
  }

  cropViewport(target: HTMLImageElement | HTMLVideoElement) {
    const style = getComputedStyle(target)
    const box = this.editor.features.transformation.boxGeometry(target, false)
    const value = style.getPropertyValue("object-view-box") || "none"
    const insets = mediaCropInsets(value)
    const width = (target instanceof HTMLImageElement ? target.naturalWidth : target.videoWidth)
      || box.width / (insets ? 1 - (insets[1] + insets[3]) / 100 : 1)
    const height = (target instanceof HTMLImageElement ? target.naturalHeight : target.videoHeight)
      || box.height / (insets ? 1 - (insets[0] + insets[2]) / 100 : 1)
    const viewport = this.parseCropViewport(value, width, height)
    if(!viewport || width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return null
    const [left, top, w, h] = viewport
    let sx = box.width / w, sy = box.height / h
    if(style.objectFit === "cover") sx = sy = Math.max(sx, sy)
    else if(style.objectFit === "contain") sx = sy = Math.min(sx, sy)
    else if(style.objectFit === "none") sx = sy = 1
    else if(style.objectFit === "scale-down") sx = sy = Math.min(1, sx, sy)
    const position = (style.objectPosition || "50% 50%").split(/\s+/)
    const offset = (value: string, space: number) => value.endsWith("%") ? parseFloat(value) / 100 * space : parseFloat(value)
    if(position.length !== 2 || !position.every(value => /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:%|px)$/.test(value))) return null
    return {width, height, left, top, w, h, sx, sy,
      x: offset(position[0], box.width - w * sx), y: offset(position[1], box.height - h * sy), box}
  }

  private parseCropViewport(value: string, width: number, height: number) {
    const insets = mediaCropInsets(value)
    if(insets) return [width * insets[3] / 100, height * insets[0] / 100,
      width * (1 - (insets[1] + insets[3]) / 100), height * (1 - (insets[0] + insets[2]) / 100)]
    const match = value.match(/^xywh\(\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px\s*\)$/)
    const rect = match?.slice(1).map(Number)
    if(rect?.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0) return rect
    // Browsers compute xywh() as inset() with pixel and percentage lengths,
    // including calc(100% - …px) for the right and bottom edges.
    const inset = value.match(/^inset\((.*)\)$/)?.[1]
    const parts = inset?.trim().match(/calc\([^()]*\)|[^\s]+/g)
    if(!parts?.length || parts.length > 4) return null
    const edges = [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]]
    const lengths = edges.map((edge, index) => {
      const size = index % 2 ? width : height
      const length = edge.match(/^(-?[\d.]+)(px|%)$/)
      if(length) return Number(length[1]) * (length[2] === "%" ? size / 100 : 1)
      if(edge === "0") return 0
      const calc = edge.match(/^calc\(\s*(-?[\d.]+)%\s+([+-])\s+([\d.]+)px\s*\)$/)
      return calc ? Number(calc[1]) * size / 100 + (calc[2] === "+" ? 1 : -1) * Number(calc[3]) : NaN
    })
    const [top, right, bottom, left] = lengths
    const viewport = [left, top, width - left - right, height - top - bottom]
    return viewport.every(Number.isFinite) && viewport[2] > 0 && viewport[3] > 0 ? viewport : null
  }

  /** Map a visual crop through the current fit and position into source pixels. */
  cropValueFor(target: HTMLImageElement | HTMLVideoElement, edges: number[]) {
    const viewport = this.cropViewport(target)
    if(!viewport) return null
    const {width, height, left, top, sx, sy, x, y, box} = viewport
    const l = left + (box.width * edges[3] / 100 - x) / sx
    const t = top + (box.height * edges[0] / 100 - y) / sy
    const w = box.width * (1 - (edges[1] + edges[3]) / 100) / sx
    const h = box.height * (1 - (edges[0] + edges[2]) / 100) / sy
    const percent = [t / height * 100, (width - l - w) / width * 100, (height - t - h) / height * 100, l / width * 100]
    const round = (value: number) => Math.round(value * 1e6) / 1e6
    return percent.every(value => value >= -1e-6)
      ? `inset(${percent.map(value => `${Math.max(0, round(value))}%`).join(" ")})`
      : `xywh(${[l, t, w, h].map(value => `${round(value)}px`).join(" ")})`
  }

  canCrop(target: HTMLImageElement | HTMLVideoElement) {
    if(target.localName === "video" && isEmptyMedia(target)) return false
    return (typeof CSS.supports !== "function" || CSS.supports("object-view-box", "inset(0%)")) && this.cropViewport(target) !== null
  }

  /** Crop the source viewport and its layout box together, preserving scale. */
  cropLayoutStyles(target: HTMLImageElement | HTMLVideoElement, value: string | null) {
    const media = target.parentElement?.localName === "picture" ? target.parentElement as HTMLElement : target
    const layout = media.parentElement?.localName === "figure" ? media.parentElement as HTMLElement : media
    const changes = new Map<HTMLElement, Record<string, import("../editor-bridge").ElementStyleMutation>>()
    const viewport = this.cropViewport(target)
    if(!viewport) return changes
    const next = this.parseCropViewport(value || "none", viewport.width, viewport.height)
    if(!next) return changes
    const box = viewport.box
    const width = Math.round(next[2] * viewport.sx * 1e6) / 1e6
    const height = Math.round(next[3] * viewport.sy * 1e6) / 1e6
    const size = {"max-width": `${width}px`, "max-height": `${height}px`, "min-width": "0px", "min-height": "0px"}
    // Explicit content dimensions avoid the uncropped intrinsic aspect ratio
    // shrinking an auto-sized image inside its new source viewport.
    const styles: Record<string, import("../editor-bridge").ElementStyleMutation> = {...size, width: `${width}px`, height: `${height}px`, "object-fit": "fill", "object-position": "0% 0%"}
    // An explicit source crop replaces the earlier percentage clip crop.
    if(target.style.clipPath && mediaCropInsets(target.style.clipPath)) styles["clip-path"] = null
    changes.set(target, styles)
    if(media !== target) changes.set(media, size)
    if(layout !== media) {
      const frame = this.editor.features.transformation.boxGeometry(layout, false)
      changes.set(layout, {"max-width": `${width}px`, "max-height": `${Math.max(height, frame.height - box.height + height)}px`})
    }
    return changes
  }

  private imageForMedia(media: Element, create: boolean) {
    const target = mediaSourceTarget(media, create)
    return target.matches("img") && target.namespaceURI === htmlNamespace
      ? target as HTMLImageElement
      : null
  }

  private selectedImage(create: boolean) {
    const media = this.selectedMedia()
    return media?.matches("picture, img") ? this.imageForMedia(media, create) : null
  }

  hasImageMap(element: Element) {
    const media = element.matches("figure") ? Array.from(element.children).find(child => child.matches("img, picture")) : element
    const image = media?.matches("img, picture") ? this.imageForMedia(media, false) : null
    return Boolean(image && this.associatedImageMap(image))
  }

  private associatedImageMap(image: HTMLImageElement) {
    const usemap = image.getAttribute("usemap")?.trim()
    if(!usemap?.startsWith("#") || usemap.length < 2) return null
    const name = usemap.slice(1)
    return Array.from(document.querySelectorAll<HTMLMapElement>("map[name]"))
      .find(map => map.namespaceURI === htmlNamespace && map.getAttribute("name") === name) ?? null
  }

  private imagesUsingMap(map: HTMLMapElement) {
    const name = map.getAttribute("name")
    if(!name) return []
    return Array.from(document.querySelectorAll<HTMLImageElement>("img[usemap]"))
      .filter(image => image.namespaceURI === htmlNamespace && image.getAttribute("usemap")?.trim() === `#${name}`)
  }

  private uniqueImageMapName() {
    const names = new Set(Array.from(document.querySelectorAll("map[name]"), map => map.getAttribute("name")))
    let name = "image-map"
    let suffix = 2
    while(names.has(name)) name = `image-map-${suffix++}`
    return name
  }

  private imageMapAreaState(map: HTMLMapElement): ImageMapAreaState[] {
    return Array.from(map.querySelectorAll("area")).flatMap(area => {
      if(area.namespaceURI !== htmlNamespace) return []
      const path = pathFromNode(map, area)
      return path ? [{path, attributes: stateAttributes(area)}] : []
    })
  }

  private selectedImageMapArea(path: number[], expected: Record<string, string>) {
    if(!Array.isArray(path) || path.some(index => !Number.isInteger(index) || index < 0)
      || !expected || typeof expected !== "object" || Array.isArray(expected)
      || Object.entries(expected).some(([name, value]) => !name || typeof value !== "string")) return null
    const image = this.selectedImage(false)
    const map = image ? this.associatedImageMap(image) : null
    const area = map ? nodeAtPath(map, path) : null
    return area instanceof Element
      && area.namespaceURI === htmlNamespace
      && area.localName === "area"
      && equalAttributes(area, expected)
      ? area as HTMLAreaElement
      : null
  }

  private commitImageMapArea(session: ImageMapDrawingSession, coords: string) {
    if(!this.isEnabled || this.editor.isEditingLocked || !session.image.isConnected || (!session.newMap && (!session.map.isConnected
      || this.associatedImageMap(session.image) !== session.map))
      || session.newMap && (session.image.getAttribute("usemap") !== session.usemap || this.associatedImageMap(session.image))
      || !isImageMapHotspotShape(session.shape)) return false
    if(session.newMap) {
      let anchor = mediaContainerForNode(session.image) ?? session.image
      if(anchor.parentElement?.matches("a")) anchor = anchor.parentElement
      if(!anchor.parentNode) return false
      session.map.setAttribute("name", this.uniqueImageMapName())
      anchor.after(session.map)
      session.image.setAttribute("usemap", `#${session.map.getAttribute("name")}`)
    }
    const area = document.createElement("area")
    area.setAttribute("shape", session.shape)
    area.setAttribute("coords", coords)
    area.setAttribute("alt", "")
    session.map.append(area)
    const media = mediaContainerForNode(session.image)
    if(media) {
      $.selectElement(media)
      this.editor.features.selection.processSelection()
    }
    this.finishImageMapChange()
    return true
  }

  private openAreaPopover(area: HTMLAreaElement) {
    const id = area.getAttribute("popovertarget") ?? area.getAttribute("interestfor")
    const content = id ? document.getElementById(id) : null
    if(!(content instanceof HTMLElement) || !content.hasAttribute("popover")) return false
    const image = this.selectedImage(false)
    const wasOpen = content.matches(":popover-open")
    if(!image || !this.popovers.open(area, image, true)) return false
    if(wasOpen) return true
    // Release image capture so normal native content editing applies inside the popover.
    this.editor.features.selection.selectElement(content)
    $.move(content, 0)
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
    return true
  }

  private finishImageMapChange() {
    this.refresh()
    this.editor.postSelectionPath()
  }

  private selectedTimedMedia() {
    const media = this.selectedMedia()
    return media?.matches("audio, video") ? media : null
  }

  private directResources(media: Element, resource: TimedMediaResourceType) {
    return Array.from(media.children).filter(child => isTimedResourceElement(child, resource))
  }

  private resourceState(media: Element, resource: TimedMediaResourceType): TimedMediaResourceState[] {
    return Array.from(media.childNodes).flatMap((node, index) => (
      isTimedResourceElement(node, resource)
        ? [{index, attributes: stateAttributes(node)}]
        : []
    ))
  }

  private timedMediaResource(resource: TimedMediaResourceType, index: number, expected: Record<string, string>) {
    if(!isTimedMediaResourceType(resource)
      || !Number.isInteger(index) || index < 0
      || !expected || typeof expected !== "object" || Array.isArray(expected)
      || Object.entries(expected).some(([name, value]) => !name || typeof value !== "string")) return null
    const media = this.selectedTimedMedia()
    const target = media?.childNodes.item(index)
    return target && isTimedResourceElement(target, resource) && equalAttributes(target, expected)
      ? target
      : null
  }

  private fallbackHTML(media: Element) {
    const ownerDocument = getInertDocument(media)
    const fragment = ownerDocument.createDocumentFragment()
    Array.from(media.childNodes).forEach(node => {
      if(!isTimedResourceElement(node)) fragment.append(cloneInert(node, true))
    })
    this.editor.clearEditingArtifacts(fragment)
    const container = ownerDocument.createElement("div")
    container.append(fragment)
    return container.innerHTML
  }

  private finishTimedMediaChange() {
    this.refresh()
    this.editor.postSelectionPath()
  }

  private setSource(element: Element, source: string, replace = false, attribute?: "poster") {
    if(!element.isConnected || !document.body.contains(element) || !(element.matches(mediaSelector) || isGraphicImage(element))
      || (attribute && !element.matches("video")) || (!replace && !isEmptyMedia(element)) || sourceEditingBlocked(element, this.editor.schema)) return false
    const target = mediaSourceTarget(element)
    if(isGraphicImage(element)) this.editor.doc.stopCapturing()
    if(replace && !attribute) {
      target.removeAttribute("srcset")
      if(element.matches("iframe")) element.removeAttribute("srcdoc")
      if(element.matches("picture")) {
        for(const child of Array.from(element.children)) {
          if(child.localName === "source") child.removeAttribute("srcset")
        }
      }
    }
    target.setAttribute(attribute ?? mediaSourceAttribute(target), source)
    if(!attribute && element.matches("audio, video")) element.setAttribute("controls", "")
    if(!isGraphicImage(element)) {
      this.editor.features.selection.captureElement(element)
    }
    this.editor.postSelectionPath()
    this.refresh()
    if(isGraphicImage(element)) this.editor.doc.stopCapturing()
    return true
  }

  private openCapture(target: Element, mode: MediaCaptureMode, replace = false, attribute?: "poster") {
    const sourceTarget = mediaSourceTarget(target, false)
    const snapshot = this.sourceSnapshot(target)
    const valid = () => this.isEnabled && document.body.contains(target)
      && !sourceEditingBlocked(target, this.editor.schema)
      && (!attribute || target.matches("video"))
      && mediaCaptureOptions(attribute === "poster" ? "picture" : placeholderMediaType(target)).some(option => option.mode === mode)
      && (replace || isEmptyMedia(target)) && this.sourceSnapshot(target) === snapshot && mediaSourceTarget(target, false) === sourceTarget
    if(!valid()) return false
    this.mediaCapture?.controller.close()
    const controller = new MediaCapture(mode, blob => {
      if(!valid()) return false
      const source = this.editor.createMediaURL(blob)
      this.rememberSource(target, source, "", mode.endsWith("image") ? "capture" : "recording")
      return this.setSource(target, source, replace, attribute)
    }, () => {
      if(this.mediaCapture?.controller !== controller) return
      this.mediaCapture = null
      if(valid() && !isGraphicImage(target)) {
        $.selectElement(target)
        this.editor.features.selection.processSelection()
        this.editor.postSelectionPath()
      }
      this.scheduleRefresh()
    })
    this.mediaCapture = {controller, valid}
    this.editor.addAppendix(controller.element)
    this.mediaPlaceholder?.hide()
    controller.show()
    return true
  }

  private setEmptyMarker(element: Element, empty: boolean) {
    if(empty) element.classList.add("◆", "◆media-empty")
    else removeEditorMarker(element, "◆media-empty")
  }

  private scheduleRefresh = () => {
    if(this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if(this.isEnabled) this.refresh()
    })
  }

  refreshPlaceholder() {
    if(!this.isEnabled) return null
    this.syncGraphicImagePlaceholders()
    // A control pointerdown can clear the authored Selection before focusin.
    // Keep the affordance bound to its existing media for the full interaction
    // without restoring the Selection, which would steal focus from the input.
    const retained = this.mediaPlaceholder?.isInteracting ? this.mediaPlaceholder.target : null
    const shape = this.editor.features.graphic.selectedShapes.length === 1
      ? graphicShapeGeometry(this.editor.features.graphic.selectedShape) : null
    const selected = retained ?? (shape && isGraphicImage(shape) ? shape : this.selectedMedia())
    if(!this.mediaCapture && selected?.isConnected && isEmptyMedia(selected)) this.placeholder.showFor(selected)
    else this.placeholder.hide()

    return selected
  }

  private refresh() {
    if(this.mediaCapture && !this.mediaCapture.valid()) this.mediaCapture.controller.close()
    document.querySelectorAll(`${mediaSelector}, svg image`).forEach(element => {
      if(sourceEditingBlocked(element, this.editor.schema)) {
        if(element.classList.contains("◆media-empty")) this.setEmptyMarker(element, false)
        return
      }
      if(element.matches("audio, video") && !element.hasAttribute("controls")) element.setAttribute("controls", "")
      const empty = isEmptyMedia(element) && !(element.matches("img") && element.closest("picture"))
      if(element.classList.contains("◆media-empty") !== empty) this.setEmptyMarker(element, empty)
    })
    const selected = this.refreshPlaceholder()

    this.popoverController?.refresh()
    const selectedImage = selected?.matches("picture, img") ? this.imageForMedia(selected, false) : null
    const previous = this.imageMapOverlayController?.image
    const image = selectedImage ?? (previous && this.popoverController?.hasOpenFor(previous) ? previous : null)
    const map = image ? this.associatedImageMap(image) : null
    const pendingDrawing = this.imageMapOverlayController?.isDrawing && image === this.imageMapOverlayController.image && !map
    if(image?.isConnected && map?.isConnected) this.imageMapOverlay.showFor(image, map,
      Boolean(this.editor.features.selection.captureSelectedElement) || Boolean(this.popoverController?.hasOpenFor(image)))
    else if(!pendingDrawing) this.imageMapOverlayController?.hide()
    this.syncInteractionShields()
  }
}
