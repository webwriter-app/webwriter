import {EditorFeature} from "."
import {stripActiveContent} from "../active-content"
import {$, adoptStylesheet, createStylesheet, getContainer, isElement} from "../utility"
import {
  isEmptyMedia,
  isMediaType,
  isTimedMediaResourceType,
  isWebsiteType,
  mediaAttributeOptions,
  mediaContainerForNode,
  mediaDefaultHTML,
  mediaElementSelector,
  mediaSourceAttribute,
  mediaSourceTarget,
  timedMediaResourceAttributeOptions,
  websiteTypes,
  type MediaSelectionState,
  type MediaType,
  type TimedMediaResourceState,
  type TimedMediaResourceType,
  type WebsiteType,
} from "../media"

const mediaSelector = mediaElementSelector
const htmlNamespace = "http://www.w3.org/1999/xhtml"
const maximumMediaFallbackLength = 1_000_000

const isTimedResourceElement = (node: Node, resource?: TimedMediaResourceType): node is Element => (
  node instanceof Element
  && node.namespaceURI === htmlNamespace
  && (resource ? node.localName === resource : isTimedMediaResourceType(node.localName))
)

const stateAttributes = (element: Element) => Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
  if(attribute.name !== "class") return [[attribute.name, attribute.value]]
  const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
  return classes.length ? [["class", classes.join(" ")]] : []
}))

const equalAttributes = (element: Element, expected: Record<string, string>) => {
  const current = stateAttributes(element)
  const names = Object.keys(current)
  return names.length === Object.keys(expected).length
    && names.every(name => current[name] === expected[name])
}

const mediaPlaceholderStylesheet = createStylesheet(`
  :host {
    position: fixed;
    z-index: 2147483644;
    display: none;
    box-sizing: border-box;
    place-items: center;
    overflow: auto;
    padding: 1.25rem;
    color: #f3f4f6;
    background: rgb(31 41 55 / 94%);
    font: 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
    user-select: none;
    container-type: inline-size;
  }
  :host([data-open]) { display: grid; }
  .content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(48rem, 100%);
    gap: .65rem;
  }
  button, input { box-sizing: border-box; font: inherit; }
  .file {
    flex: 0 0 auto;
    min-height: 2.75rem;
    padding: .65rem 1rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
    font-weight: 600;
    cursor: pointer;
  }
  .file:hover, .apply:hover { background: #eef4fb; }
  .or { flex: 0 0 auto; color: #d1d5db; font-size: 1rem; }
  .url-row { display: flex; flex: 1 1 20rem; min-width: 0; gap: .4rem; }
  .url {
    min-width: 0;
    min-height: 2.6rem;
    flex: 1 1 auto;
    padding: .55rem .7rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
  }
  .apply {
    flex: 0 0 auto;
    padding: .55rem .8rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
    cursor: pointer;
  }
  input:focus, button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
  @container (max-width: 34rem) {
    .content {
      display: grid;
      width: min(32rem, 100%);
      gap: .75rem;
      justify-items: center;
    }
    .url-row { width: 100%; }
  }
`)

class MediaPlaceholder {
  readonly element = document.createElement("div")
  readonly root: ShadowRoot
  target: Element | null = null
  onSource: ((target: Element, source: string) => void) | null = null
  onInteractionChange: (() => void) | null = null
  private focusWithin = false
  private pickerOpen = false
  private interactionActive = false

  get isInteracting() {
    return this.element.isConnected && this.interactionActive
  }

  constructor() {
    this.element.classList.add("◆", "◆editor-only", "◆media-placeholder")
    this.element.contentEditable = "false"
    this.element.setAttribute("part", "media-placeholder")
    this.element.setAttribute("aria-hidden", "true")
    const root = this.element.attachShadow({mode: "open"})
    this.root = root
    adoptStylesheet(root, mediaPlaceholderStylesheet)
    root.innerHTML = `
      <div class="content">
        <button class="file" type="button"></button>
        <input class="picker" type="file" hidden />
        <span class="or">or</span>
        <div class="url-row">
          <input class="url" type="url" />
          <button class="apply" type="button">Apply</button>
        </div>
      </div>
    `

    const picker = root.querySelector<HTMLInputElement>(".picker")!
    const url = root.querySelector<HTMLInputElement>(".url")!
    const file = root.querySelector<HTMLButtonElement>(".file")!
    root.addEventListener("pointerdown", event => {
      if(!(event.target instanceof Element) || !event.target.closest("button, input")) return
      this.beginInteraction()
    })
    root.addEventListener("focusin", () => {
      this.focusWithin = true
      this.beginInteraction()
    })
    root.addEventListener("focusout", () => {
      this.focusWithin = false
      queueMicrotask(() => {
        if(this.focusWithin || this.pickerOpen) return
        this.interactionActive = false
        this.onInteractionChange?.()
      })
    })
    file.addEventListener("click", () => {
      this.pickerOpen = true
      picker.click()
    })
    root.querySelector<HTMLButtonElement>(".apply")!.addEventListener("click", () => this.applyUrl())
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
      const reader = new FileReader()
      reader.addEventListener("load", () => {
        if(typeof reader.result === "string") this.onSource?.(target, reader.result)
      }, {once: true})
      reader.readAsDataURL(file)
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

  private applyUrl() {
    const input = this.root.querySelector<HTMLInputElement>(".url")!
    const source = input.value.trim()
    if(this.target && source) this.onSource?.(this.target, source)
  }

  showFor(target: Element) {
    this.target = target
    const type = target.localName as MediaType
    const noun = type === "picture" || type === "img" ? "image"
      : isWebsiteType(type) ? "website" : type
    const file = this.root.querySelector<HTMLButtonElement>(".file")!
    const picker = this.root.querySelector<HTMLInputElement>(".picker")!
    const url = this.root.querySelector<HTMLInputElement>(".url")!
    file.textContent = `Select ${noun} file`
    picker.accept = type === "picture" || type === "img" ? "image/*"
      : type === "audio" ? "audio/*"
      : type === "video" ? "video/*"
      : ".html,.htm,text/html"
    url.placeholder = `Enter ${noun} URL`
    const rect = target.getBoundingClientRect()
    Object.assign(this.element.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    this.element.setAttribute("data-open", "")
    this.element.removeAttribute("aria-hidden")
  }

  hide() {
    this.target = null
    this.element.removeAttribute("data-open")
    this.element.setAttribute("aria-hidden", "true")
  }
}

/** Media insertion and editing. Empty media are marked only with editor
 * classes; their interactive UI lives in the BODY shadow appendix. */
export class MediaFeature extends EditorFeature {
  private observer: MutationObserver | null = null
  private refreshQueued = false
  private mediaPlaceholder: MediaPlaceholder | null = null

  get isPlaceholderInteraction() {
    return this.mediaPlaceholder?.isInteracting ?? false
  }

  get placeholder() {
    if(!this.mediaPlaceholder) {
      this.mediaPlaceholder = new MediaPlaceholder()
      this.mediaPlaceholder.onSource = (target, source) => this.setSource(target, source)
      this.mediaPlaceholder.onInteractionChange = this.scheduleRefresh
      this.editor.addAppendix(this.mediaPlaceholder.element)
    }
    return this.mediaPlaceholder
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
    window.addEventListener("resize", this.scheduleRefresh)
    document.addEventListener("scroll", this.scheduleRefresh, true)
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener("resize", this.scheduleRefresh)
    document.removeEventListener("scroll", this.scheduleRefresh, true)
    this.mediaPlaceholder?.element.remove()
    this.mediaPlaceholder = null
    document.querySelectorAll(".◆media-empty").forEach(element => this.setEmptyMarker(element, false))
    super.disable()
  }

  passiveListeners = {
    selectionchange: () => this.scheduleRefresh(),
  }

  activeListeners = {
    pointerdown: (event: PointerEvent) => {
      const target = event.target instanceof Node ? mediaContainerForNode(event.target) : null
      if(!target || !isEmptyMedia(target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      $.selectElement(target)
      this.editor.features.selection.processSelection()
      this.editor.postSelectionPath()
      this.refresh()
    },
  }

  actions = {
    insertMedia: ({media}: {type: "insertMedia", media: MediaType}) => {
      if(!isMediaType(media)) throw new TypeError(`Unsupported media type '${String(media)}'`)
      const template = document.createElement("template")
      template.innerHTML = mediaDefaultHTML(media)
      const element = template.content.firstElementChild!
      this.editor.features.manipulation.insert(template.content)
      if(element.isConnected) {
        $.selectElement(element)
        this.editor.features.selection.processSelection()
      }
      this.refresh()
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
      const removedUnsafeItems = stripActiveContent(template.content)
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
      const selected = this.selectedMedia()
      if(!selected || !selected.matches("picture, img") || selected.localName === image) return
      let replacement: Element
      if(image === "img") {
        replacement = selected.querySelector(":scope > img") ?? document.createElement("img")
        selected.replaceWith(replacement)
      }
      else {
        replacement = document.createElement("picture")
        selected.replaceWith(replacement)
        replacement.append(selected)
      }
      $.selectElement(replacement)
      this.editor.features.selection.processSelection()
      this.refresh()
    },
    switchWebsiteType: ({website}: {type: "switchWebsiteType", website: WebsiteType}) => {
      if(!isWebsiteType(website)) throw new TypeError(`Unsupported website type '${String(website)}'`)
      const selected = this.selectedMedia()
      if(!selected || !isWebsiteType(selected.localName) || selected.localName === website) return

      const replacement = document.createElement(website)
      const allowed = new Set(mediaAttributeOptions[website].map(option => option.name))
      const websiteAttributes = new Set(websiteTypes.flatMap(type => mediaAttributeOptions[type].map(option => option.name)))
      const source = selected.getAttribute(mediaSourceAttribute(selected))
      Array.from(selected.attributes).forEach(attribute => {
        if(attribute.name === "class") {
          const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
          if(classes.length) replacement.setAttribute("class", classes.join(" "))
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
    if(element.matches("audio, video")) {
      state.sources = this.resourceState(element, "source")
      state.tracks = this.resourceState(element, "track")
      state.fallbackHTML = this.fallbackHTML(element)
    }
    return state
  }

  private selectedMedia() {
    const selected = $.selectedElement
    if(selected?.matches(mediaSelector)) return mediaContainerForNode(selected)
    const container = $.anchorContainer
    return isElement(container) ? mediaContainerForNode(container) : null
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
    const fragment = document.createDocumentFragment()
    Array.from(media.childNodes).forEach(node => {
      if(!isTimedResourceElement(node)) fragment.append(node.cloneNode(true))
    })
    this.editor.clearEditingArtifacts(fragment)
    const container = document.createElement("div")
    container.append(fragment)
    return container.innerHTML
  }

  private finishTimedMediaChange() {
    this.refresh()
    this.editor.postSelectionPath()
  }

  private setSource(element: Element, source: string) {
    if(!element.isConnected || !element.matches(mediaSelector)) return
    const target = mediaSourceTarget(element)
    target.setAttribute(mediaSourceAttribute(target), source)
    if(element.matches("audio, video")) element.setAttribute("controls", "")
    $.selectElement(element)
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
    this.refresh()
  }

  private setEmptyMarker(element: Element, empty: boolean) {
    element.classList.toggle("◆media-empty", empty)
    if(empty) element.classList.add("◆")
    else if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
      element.classList.remove("◆")
      if(!element.classList.length) element.removeAttribute("class")
    }
  }

  private scheduleRefresh = () => {
    if(this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if(this.isEnabled) this.refresh()
    })
  }

  private refresh() {
    document.querySelectorAll(mediaSelector).forEach(element => {
      const empty = isEmptyMedia(element) && !(element.matches("img") && element.closest("picture"))
      if(element.classList.contains("◆media-empty") !== empty) this.setEmptyMarker(element, empty)
    })
    // A control pointerdown can clear the authored Selection before focusin.
    // Keep the affordance bound to its existing media for the full interaction
    // without restoring the Selection, which would steal focus from the input.
    const retained = this.mediaPlaceholder?.isInteracting ? this.mediaPlaceholder.target : null
    const selected = retained ?? this.selectedMedia()
    if(selected?.isConnected && isEmptyMedia(selected)) this.placeholder.showFor(selected)
    else this.placeholder.hide()
  }
}
