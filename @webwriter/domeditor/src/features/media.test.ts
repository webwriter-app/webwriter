// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {Window as TestWindow} from "happy-dom"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import editorStyleString from "../editor.css?raw"
import {$} from "../utility"
import {createImageMapPopoverController, imageMapHotspotBounds} from "../media"

let editor: DOMEditor
const fetchSettings = (window as unknown as TestWindow).happyDOM.settings.fetch
const originalFetchInterceptor = fetchSettings.interceptor

// Happy DOM does not carry DragEventInit.dataTransfer through its constructor.
function mediaDragEvent(type: string, dataTransfer: DataTransfer) {
  const event = new DragEvent(type, {bubbles: true, composed: true, cancelable: true})
  Object.defineProperty(event, "dataTransfer", {value: dataTransfer})
  return event
}

function fileTransfer(file: File) {
  const transfer = new DataTransfer()
  transfer.items.add(file)
  // Happy DOM omits Files when a File has an empty MIME type.
  Object.defineProperty(transfer, "types", {configurable: true, value: ["Files"]})
  return transfer
}

beforeEach(() => {
  // Happy DOM omits these standard native media constants.
  Object.defineProperties(HTMLMediaElement, {
    HAVE_METADATA: {value: 1, configurable: true},
    NETWORK_NO_SOURCE: {value: 3, configurable: true},
  })
  // Source-attribute tests should not request real iframe pages.
  fetchSettings.interceptor = {beforeAsyncRequest: async ({window}) => new window.Response("")}
  document.body.replaceChildren()
  editor = new DOMEditor()
  $.move(document.body.firstElementChild!)
})

afterEach(() => {
  editor.destroy()
  fetchSettings.interceptor = originalFetchInterceptor
})

describe("media editing", () => {
  it.each([
    {readyState: 0},
    {readyState: 1, videoWidth: 640, videoHeight: 360},
    {error: {code: 1}},
    {error: {code: 2}},
  ])("does not report a codec problem for loading, healthy or network-failed video: %j", status => {
    document.body.innerHTML = '<video controls src="movie.webm"></video>'
    const video = document.querySelector("video")!
    Object.entries(status).forEach(([name, value]) => Object.defineProperty(video, name, {value, configurable: true}))
    editor.features.selection.captureElement(video)
    expect(editor.features.media.getState()?.videoPlaybackWarning).toBeUndefined()
  })

  it.each([
    [{error: {code: 3}}, "unsupported"],
    [{error: {code: 4}}, "unsupported"],
    [{networkState: 3}, "unsupported"],
    [{networkState: 3, currentSrc: "https://example.test/previous.webm"}, "unsupported"],
    [{readyState: 1, videoWidth: 0, videoHeight: 0}, "no-video"],
  ] as const)("reports native video playback failure %j", (status, expected) => {
    document.body.innerHTML = '<figure><!--keep--><video controls><source src="movie.ogv"><track src="captions.vtt"></video><figcaption>Bird</figcaption></figure>'
    const video = document.querySelector("video")!
    Object.entries(status).forEach(([name, value]) => Object.defineProperty(video, name, {value, configurable: true}))
    editor.features.selection.captureElement(video)
    const html = editor.toHTML(true)
    expect(editor.features.media.getState()?.videoPlaybackWarning).toBe(expected)
    expect(editor.toHTML(true)).toBe(html)
    expect(editor.doc.body.toString()).not.toContain("videoPlaybackWarning")
  })

  it("refreshes warnings on non-bubbling playback events and clears recovered or replaced sources", () => {
    document.body.innerHTML = '<video controls src="movie.ogv"></video>'
    const video = document.querySelector("video")!
    const status = {currentSrc: video.src, readyState: 1, videoWidth: 0, videoHeight: 0}
    for(const name of Object.keys(status) as Array<keyof typeof status>) Object.defineProperty(video, name, {get: () => status[name]})
    editor.features.selection.captureElement(video)
    const post = vi.spyOn(editor, "postSelectionPath")
    for(const type of ["loadedmetadata", "loadeddata", "resize", "error", "emptied", "loadstart"]) {
      post.mockClear()
      video.dispatchEvent(new Event(type))
      expect(post).toHaveBeenCalledOnce()
    }
    expect(editor.features.media.getState()?.videoPlaybackWarning).toBe("no-video")
    status.videoWidth = 640
    status.videoHeight = 360
    video.dispatchEvent(new Event("resize"))
    expect(editor.features.media.getState()?.videoPlaybackWarning).toBeUndefined()
    status.videoWidth = status.videoHeight = 0
    video.src = "replacement.webm"
    expect(editor.features.media.getState()?.videoPlaybackWarning).toBeUndefined()
    video.removeAttribute("src")
    expect(editor.features.media.getState()?.videoPlaybackWarning).toBeUndefined()
    post.mockClear()
    editor.features.media.disable()
    video.dispatchEvent(new Event("loadedmetadata"))
    expect(post).not.toHaveBeenCalled()
  })

  it("observes child source errors and ignores disconnected, replaced and widget-owned video", async () => {
    document.body.innerHTML = '<video controls><source src="movie.ogv"></video><custom-widget></custom-widget>'
    const video = document.querySelector("video")!, source = video.querySelector("source")!
    editor.features.selection.captureElement(video)
    const post = vi.spyOn(editor, "postSelectionPath")
    source.dispatchEvent(new Event("error"))
    await Promise.resolve()
    expect(post).toHaveBeenCalledOnce()
    post.mockClear()
    document.querySelector("custom-widget")!.append(video)
    video.dispatchEvent(new Event("loadedmetadata"))
    const shadow = document.querySelector("custom-widget")!.attachShadow({mode: "open"})
    shadow.innerHTML = '<video src="widget.ogv"></video>'
    shadow.querySelector("video")!.dispatchEvent(new Event("loadedmetadata", {composed: true}))
    expect(post).not.toHaveBeenCalled()
    video.replaceWith(document.createElement("video"))
    video.dispatchEvent(new Event("loadedmetadata"))
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    '<picture><!--keep--><img></picture>', '<img>', '<audio controls=""></audio>',
    '<video controls=""></video>', '<iframe></iframe>', '<embed>', '<object></object>',
  ])("focuses the URL input when selecting empty media: %s", async html => {
    document.body.innerHTML = `<p>before</p>${html}<p>after</p>`
    const target = document.querySelector("picture, img, audio, video, iframe, embed, object")!
    editor.features.selection.captureElement(target)
    await Promise.resolve()

    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    expect(placeholder.target).toBe(target)
    expect(placeholder.root.activeElement).toBe(input)
    expect(editor.features.selection.captureSelectedElement).toBe(target)
    expect(editor.toHTML(true)).toBe(`<p>before</p>${html}<p>after</p>`)

    const file = placeholder.root.querySelector<HTMLButtonElement>(".file")!
    file.focus()
    editor.features.media.refreshPlaceholder()
    expect(placeholder.root.activeElement).toBe(file)
  })

  it("opens a compact media popover and focuses its URL input on selection", () => {
    document.body.innerHTML = "<picture><img></picture>"
    const image = document.querySelector("picture")!
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 32, 32))
    const placeholder = editor.features.media.placeholder
    const content = placeholder.root.querySelector<HTMLElement>(".content")!
    content.showPopover = vi.fn()

    editor.features.selection.captureElement(image)
    editor.features.media.refreshPlaceholder()

    expect(content.showPopover).toHaveBeenCalledOnce()
    expect(placeholder.element).toHaveAttribute("data-popup-open")
    expect(placeholder.root.activeElement).toBe(placeholder.root.querySelector(".url"))
  })

  it("focuses compact media after the selecting click and cancels pending focus on removal", async () => {
    document.body.innerHTML = "<picture><img></picture>"
    const image = document.querySelector("picture")!
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 32, 32))
    const placeholder = editor.features.media.placeholder
    const content = placeholder.root.querySelector<HTMLElement>(".content")!
    content.showPopover = vi.fn()

    image.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    expect(content.showPopover).not.toHaveBeenCalled()
    image.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    image.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    await Promise.resolve()
    expect(content.showPopover).toHaveBeenCalledOnce()
    expect(placeholder.root.activeElement).toBe(placeholder.root.querySelector(".url"))

    placeholder.hide()
    image.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    image.remove()
    image.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, button: 0}))
    window.dispatchEvent(new MouseEvent("click"))
    await Promise.resolve()
    expect(content.showPopover).toHaveBeenCalledOnce()
  })

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "focuses the URL input after inserting %s", async media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      await Promise.resolve()

      const placeholder = editor.features.media.placeholder
      expect(placeholder.target).toBe(editor.features.selection.captureSelectedElement)
      expect(placeholder.root.activeElement).toBe(placeholder.root.querySelector(".url"))
    },
  )

  it.each(['<video></video>', '<video src=" "></video>', '<video><source src=" "></video>'])("does not crop an empty video: %s", html => {
    document.body.innerHTML = html
    const video = document.querySelector("video")!
    video.style.cssText = "width:320px;height:180px"
    editor.features.selection.captureElement(video)
    const authored = editor.toHTML(true)
    expect(editor.features.media.cropTargetFor(video)).toBeNull()
    expect(editor.features.media.canCrop(video)).toBe(false)
    expect(editor.features.transformation.overlay.querySelector<HTMLElement>(".◆transform-overlay-crop-frame")!.hidden).toBe(true)
    expect(editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(10%)"})).toBe(false)
    expect(editor.toHTML(true)).toBe(authored)
    video.innerHTML = '<source src="movie.mp4">'
    editor.features.selection.processSelection()
    expect(editor.features.media.canCrop(video)).toBe(true)
    expect(editor.features.transformation.overlay.querySelector<HTMLElement>(".◆transform-overlay-crop-frame")!.hidden).toBe(false)
    video.querySelector("source")!.remove()
    editor.features.selection.processSelection()
    expect(editor.features.media.canCrop(video)).toBe(false)
  })

  const mockImageGeometry = (image: HTMLImageElement, width: number, height: number, naturalWidth: number, naturalHeight: number) => {
    image.style.width = `${width}px`
    image.style.height = `${height}px`
    Object.defineProperties(image, {
      naturalWidth: {configurable: true, value: naturalWidth},
      naturalHeight: {configurable: true, value: naturalHeight},
    })
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height))
  }

  it("applies a default aspect ratio only to empty media placeholders", () => {
    document.body.innerHTML = '<picture><source srcset="photo.webp"><img srcset="photo.png"></picture><video><source src="movie.mp4"></video><picture></picture><video></video>'
    editor.features.media["refresh"]()
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(editorStyleString)
    const aspectRules = Array.from(sheet.cssRules).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && !!rule.style.getPropertyValue("aspect-ratio"))
    const [image, video, emptyImage, emptyVideo] = document.body.querySelectorAll("picture, video")
    for(const actual of [image, video]) {
      expect(actual).not.toHaveClass("◆media-empty")
      expect(aspectRules.filter(rule => actual.matches(rule.selectorText))).toHaveLength(0)
    }
    for(const placeholder of [emptyImage, emptyVideo]) {
      expect(placeholder).toHaveClass("◆media-empty")
      expect(aspectRules.some(rule => placeholder.matches(rule.selectorText) && rule.style.getPropertyValue("aspect-ratio") === "16 / 9")).toBe(true)
    }
  })

  it("sizes the source and figure together and restores the full viewport on clear", () => {
    document.body.innerHTML = '<figure style="width: 360px"><picture style="width: 360px; height: 200px"><img style="width: 360px; height: 200px"></picture><figcaption>Caption</figcaption></figure>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const figure = document.querySelector("figure")!
    const image = document.querySelector("img")!
    const picture = document.querySelector("picture")!
    $.selectElement(figure)
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(15% 20% 25% 10%)"})
    expect(parseFloat(figure.style.maxWidth)).toBeCloseTo(252)
    expect(figure.style.maxHeight).toBe("120px")
    expect(figure.style.width).toBe("360px")
    expect(figure.style.height).toBe("")
    expect(picture.style.width).toBe("360px")
    expect(picture.style.height).toBe("200px")
    expect(image.style.width).toBe("252px")
    expect(image.style.height).toBe("120px")
    expect(image.style.maxWidth).toBe("252px")
    expect(image.style.maxHeight).toBe("120px")
    expect(image.style.objectFit).toBe("fill")
    expect(image.style.getPropertyValue("object-view-box")).toBe("inset(15% 20% 25% 10%)")
    expect(picture.style.maxWidth).toBe("252px")
    expect(picture.style.maxHeight).toBe("120px")
    expect(figure.outerHTML).not.toContain("--ww-crop")
    // Reapplying the same crop must not shrink the frame again.
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(15% 20% 25% 10%)"})
    expect(parseFloat(figure.style.maxWidth)).toBeCloseTo(252)
    const cropped = editor.toHTML(true)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: null})
    expect(image.style.getPropertyValue("object-view-box")).toBe("")
    expect(image.style.width).toBe("360px")
    expect(image.style.height).toBe("200px")
    expect(image.style.maxWidth).toBe("360px")
    expect(image.style.maxHeight).toBe("200px")
    expect(image.style.objectFit).toBe("fill")
    expect(picture.style.maxWidth).toBe("360px")
    expect(picture.style.maxHeight).toBe("200px")
    expect(figure.style.maxWidth).toBe("360px")
    expect(figure.style.maxHeight).toBe("200px")
    const cleared = editor.toHTML(true)
    editor.doc.syncFromDOM()
    editor.doc.undo()
    expect(editor.toHTML(true)).toBe(cropped)
    editor.doc.redo()
    expect(editor.toHTML(true)).toBe(cleared)
  })

  it("sizes a standalone media crop without changing authored margins", () => {
    document.body.innerHTML = '<video src="movie.mp4" style="width: 360px; height: 200px; margin-top: 12px !important; margin-left: 8px"></video>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(15% 20% 25% 10%)"})
    expect(parseFloat(video.style.maxWidth)).toBeCloseTo(252)
    expect(video.style.maxHeight).toBe("120px")
    expect(video.style.width).toBe("252px")
    expect(video.style.height).toBe("120px")
    expect(video.style.objectFit).toBe("fill")
    expect(video.style.getPropertyValue("object-view-box")).toBe("inset(15% 20% 25% 10%)")
    expect(video.style.getPropertyValue("margin-top")).toBe("12px")
    expect(video.style.getPropertyPriority("margin-top")).toBe("important")
    expect(video.style.marginLeft).toBe("8px")
    expect(video.getAttribute("style")).not.toContain("--ww-crop")
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: null})
    expect(video.style.getPropertyValue("object-view-box")).toBe("")
    expect(video.style.maxWidth).toBe("360px")
    expect(video.style.maxHeight).toBe("200px")
    expect(video.style.width).toBe("360px")
    expect(video.style.height).toBe("200px")
    expect(video.style.getPropertyValue("margin-top")).toBe("12px")
    expect(video.style.getPropertyPriority("margin-top")).toBe("important")
    expect(video.style.marginLeft).toBe("8px")
    expect(video.getAttribute("style")).not.toContain("--ww-crop")
  })

  it("maps a local crop to the natural image viewport and resizes the displayed source", () => {
    const image = document.createElement("img")
    document.body.append(image)
    mockImageGeometry(image, 500, 200, 1000, 400)

    expect(editor.features.media.cropValueFor(image, [10, 25, 20, 15])).toBe("inset(10% 25% 20% 15%)")
    const styles = editor.features.media.cropLayoutStyles(image, "inset(10% 25% 20% 15%)").get(image)!
    expect(styles["width"]).toBe("300px")
    expect(styles["height"]).toBe("140px")
    expect(styles["max-width"]).toBe("300px")
    expect(styles["max-height"]).toBe("140px")
    expect(styles["object-fit"]).toBe("fill")
  })

  it.each([
    ["cover", [10, 25, 20, 15], "inset(10% 33.333333% 20% 26.666667%)", "300px", "210px"],
    ["contain", [25, 10, 25, 10], "inset(12.5% 10% 12.5% 10%)", "400px", "150px"],
    ["contain", [10, 10, 10, 10], "xywh(100px -40px 800px 480px)", "400px", "240px"],
  ] as const)("maps local crop edges through object-fit %s", (fit, edges, expectedCrop, expectedWidth, expectedHeight) => {
    const image = document.createElement("img")
    image.style.objectFit = fit
    document.body.append(image)
    mockImageGeometry(image, 500, 300, 1000, 400)

    const crop = editor.features.media.cropValueFor(image, [...edges])
    expect(crop).toBe(expectedCrop)
    const styles = editor.features.media.cropLayoutStyles(image, crop).get(image)!
    expect(styles.width).toBe(expectedWidth)
    expect(styles.height).toBe(expectedHeight)
    expect(styles["object-fit"]).toBe("fill")
  })

  it("preserves an explicit object position when mapping a crop and aligns the new viewport", () => {
    const image = document.createElement("img")
    document.body.append(image)
    mockImageGeometry(image, 500, 200, 1000, 400)
    image.style.objectPosition = "10px 20px"
    const value = editor.features.media.cropValueFor(image, [10, 25, 20, 15])!
    expect(value).toBe("inset(0% 27% 30% 13%)")
    const styles = editor.features.media.cropLayoutStyles(image, value).get(image)!
    expect(styles.width).toBe("300px")
    expect(styles.height).toBe("140px")
    expect(styles["object-position"]).toBe("0% 0%")
  })

  it("allows a crop smaller than the editor's default media minimum", () => {
    document.body.innerHTML = '<video src="movie.mp4" style="width:500px;height:200px"></video>'
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(0% 0% 0% 80%)"})
    expect(video.style.width).toBe("100px")
    expect(video.style.maxWidth).toBe("100px")
    expect(video.style.minWidth).toBe("0px")
    expect(video.style.minHeight).toBe("0px")
  })

  it("replaces the previous percentage clip crop with a source viewport", () => {
    document.body.innerHTML = '<video src="movie.mp4" style="width: 360px; height: 200px; clip-path: inset(10%)"></video>'
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop: "inset(10%)"})
    expect(video.style.clipPath).toBe("")
    expect(video.style.getPropertyValue("object-view-box")).toBe("inset(10%)")
  })

  it("crops nested picture and video surfaces without disturbing their surrounding markup", async () => {
    document.body.innerHTML = `
      <p class="lead"><picture><source media="(max-width: 20rem)" srcset="small.png"><img src="large.png" alt="Photo"></picture> after</p>
      <figure><video controls><source src="movie.mp4" type="video/mp4"></video><figcaption>Caption</figcaption></figure>
    `
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const before = editor.toHTML(true)
    const picture = document.querySelector("picture")!
    const figure = document.querySelector("figure")!
    const crop = {value: "inset(10% 20% 30% 40%)", priority: ""} as const

    $.selectElement(picture)
    expect(editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop})).toBe(true)
    await Promise.resolve()
    const croppedImage = picture.querySelector("img")!
    expect(croppedImage.style.getPropertyValue("object-view-box")).toBe(crop.value)
    expect(picture.querySelector("source")?.getAttribute("srcset")).toBe("small.png")
    expect(picture.parentElement?.outerHTML).toContain("class=\"lead\"")

    $.selectElement(figure)
    expect(editor.features.media.actions.setMediaCrop({type: "setMediaCrop", crop})).toBe(true)
    await Promise.resolve()
    expect(figure.querySelector("video")?.style.getPropertyValue("object-view-box")).toBe(crop.value)
    expect(figure.querySelector("source")?.getAttribute("src")).toBe("movie.mp4")
    expect(figure.querySelector("figcaption")?.textContent).toBe("Caption")

    const after = editor.toHTML(true)
    const serialized = new DOMParser().parseFromString(after, "text/html")
    expect(serialized.querySelector("picture img")?.getAttribute("style")).toContain("object-view-box: inset(10% 20% 30% 40%);")
    expect(serialized.querySelector("picture source")?.getAttribute("srcset")).toBe("small.png")
    expect(serialized.querySelector("video")?.getAttribute("style")).toContain("object-view-box: inset(10% 20% 30% 40%);")
    expect(serialized.querySelector("figure figcaption")?.textContent).toBe("Caption")
    editor.doc.undo()
    await Promise.resolve()
    expect(editor.toHTML(true)).toBe(before)
    editor.doc.redo()
    await Promise.resolve()
    expect(editor.toHTML(true)).toBe(after)
  })

  it("resolves the current image after a selected picture's image is replaced", () => {
    document.body.innerHTML = "<picture><img src=\"old.png\"></picture>"
    const picture = document.querySelector("picture")!
    const oldImage = picture.querySelector("img")!
    $.selectElement(picture)
    oldImage.remove()
    picture.innerHTML = '<img src="new.png">'

    expect(editor.features.media.actions.setMediaCrop({
      type: "setMediaCrop", crop: {value: "inset(10%)", priority: ""},
    })).toBe(true)
    expect(oldImage.style.getPropertyValue("object-view-box")).toBe("")
    expect(picture.querySelector("img")?.style.getPropertyValue("object-view-box")).toBe("inset(10%)")

    picture.remove()
    expect(editor.features.media.actions.setMediaCrop({
      type: "setMediaCrop", crop: {value: "inset(20%)", priority: ""},
    })).toBe(false)
  })

  it.each([
    "inset(20px calc(100% - 700px) calc(100% - 440px) -100px)",
    "inset(20px -60px 40px -100px)",
  ])("keeps a video crop editable when its computed viewport is %s", computed => {
    document.body.innerHTML = '<video src="movie.mp4" style="width: 300px; height: 180px; object-fit: fill; object-position: 0% 0%; object-view-box: xywh(-100px 20px 800px 420px)"></video>'
    const video = document.querySelector("video")!
    Object.defineProperties(video, {videoWidth: {value: 640}, videoHeight: {value: 480}})
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 180))
    const nativeStyle = getComputedStyle
    vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = nativeStyle(element, pseudo)
      return element !== video ? style : new Proxy(style, {get(style, property) {
        if(property === "getPropertyValue") return (name: string) => name === "object-view-box" ? computed : style.getPropertyValue(name)
        const value = Reflect.get(style, property, style)
        return typeof value === "function" ? value.bind(style) : value
      }})
    })
    try {
      editor.features.selection.captureElement(video)
      expect(editor.features.media.canCrop(video)).toBe(true)
      expect(editor.features.transformation.overlay.querySelector<HTMLElement>('.◆transform-overlay-crop-frame')!.hidden).toBe(false)
      expect(editor.features.media.cropValueFor(video, [10, 0, 0, 10])).toBe("xywh(-20px 62px 720px 378px)")
    }
    finally { vi.restoreAllMocks() }
  })

  it("does not crop media owned by an atomic widget", () => {
    document.body.innerHTML = '<media-widget><img src="widget.png"></media-widget>'
    const widget = document.querySelector("media-widget")!
    const image = widget.querySelector("img")!
    $.selectElement(image)

    expect(editor.features.media.actions.setMediaCrop({
      type: "setMediaCrop", crop: {value: "inset(10%)", priority: ""},
    })).toBe(false)
    expect(image.style.getPropertyValue("object-view-box")).toBe("")
  })

  it("does not construct widgets while serializing timed-media fallback HTML", () => {
    let constructions = 0
    const tag = "media-serialization-probe"
    if(!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {
        constructor() {
          super()
          constructions++
        }
      })
    }
    document.body.innerHTML = `<video><${tag}>Fallback</${tag}></video>`
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.selection.processSelection()
    const baseline = constructions

    expect(editor.features.media.getState()!.fallbackHTML).toContain(`<${tag}>Fallback</${tag}>`)
    expect(constructions).toBe(baseline)
  })

  it("inserts a package's remote simulation iframe with its sandbox intact", () => {
    editor.features.manipulation.insertHTML('<iframe src="https://phet.colorado.edu/sims/html/neuron/latest/neuron_all.html"></iframe>')
    const frame = document.querySelector("iframe")!
    expect(frame).not.toBeNull()
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame.getAttribute("src")).toBe("https://phet.colorado.edu/sims/html/neuron/latest/neuron_all.html")
    expect(frame.parentElement).toBe(document.body)
    expect(editor.toHTML(true)).toContain('sandbox="allow-scripts"')
  })

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "capture-selects the %s surface and its placeholder controls", async media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media === "img" ? "picture" : ["embed", "object"].includes(media) ? "iframe" : media)!
      const placeholder = editor.features.media.placeholder

      for(const selector of [".file", ".file svg", ".url", ".apply"]) {
        target.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
        expect($.selectedElement).toBe(target)
        expect(editor.features.selection.captureSelectedElement).toBe(target)
        expect(target).toHaveClass("◆element-selected")
        expect(target).toHaveClass("◆element-capture-selected")

        placeholder.root.querySelector(selector)!.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true, composed: true, cancelable: true, button: 0,
        }))
        expect(editor.features.selection.captureSelectedElement).toBe(target)
        expect(target).toHaveClass("◆element-capture-selected")
      }
    },
  )

  it.each([
    '<picture><img src="image.png"></picture>', '<img src="image.png">',
    '<audio src="audio.mp3"></audio>', '<video src="video.mp4"></video>',
    '<iframe src="about:blank"></iframe>', '<embed src="about:blank">',
    '<object data="about:blank"></object>',
  ])("capture-selects populated media on repeated surface clicks: %s", html => {
    document.body.innerHTML = html
    const target = document.body.firstElementChild!
    for(let click = 0; click < 2; click++) {
      const down = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
      target.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(false)
      expect($.selectedElement).toBe(target)
      expect(editor.features.selection.captureSelectedElement).toBe(target)
    }
  })

  it("enables audio controls and restores them after direct DOM changes", async () => {
    document.body.innerHTML = '<audio></audio><audio src="sound.mp3"></audio><media-widget><audio></audio></media-widget>'
    const [empty, populated, widgetAudio] = Array.from(document.querySelectorAll("audio"))

    await vi.waitFor(() => {
      expect(empty).toHaveAttribute("controls")
      expect(populated).toHaveAttribute("controls")
    })
    expect(widgetAudio).not.toHaveAttribute("controls")

    populated.removeAttribute("controls")
    await vi.waitFor(() => expect(populated).toHaveAttribute("controls"))
    expect(editor.toHTML(true)).toContain('<audio src="sound.mp3" controls=""></audio>')
  })

  it.each(["picture", "audio", "video", "iframe"] as const)("initially captures inserted %s", media => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media})
    expect(editor.features.selection.captureSelectedElement).toBe(document.querySelector(media))
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["audio", "video"])("switches %s between its outline and native controls", tag => {
    document.body.innerHTML = `<figure><!--keep--><${tag} src="movie.mp4" controls></${tag}><figcaption>Caption</figcaption></figure><p>After</p>`
    const media = document.querySelector(tag)!
    const selection = editor.features.selection
    const authored = editor.toHTML(true)
    for(let attempt = 0; attempt < 2; attempt++) {
      const down = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
      media.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(false)
      expect(selection.captureSelectedElement).toBe(media)
      expect(selection.isInDragSelection).toBe(false)
      const key = new KeyboardEvent("keydown", {key: " ", bubbles: true, cancelable: true})
      media.dispatchEvent(key)
      expect(key.defaultPrevented).toBe(false)
      const click = new MouseEvent("click", {bubbles: true, cancelable: true, detail: 2})
      media.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(false)
      expect(selection.captureSelectedElement).toBe(media)
      selection.selectionCaret!.querySelector(".◆capture-edge")!.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, composed: true, cancelable: true, button: 0,
      }))
      expect(selection.captureSelectedElement).toBeNull()
      expect($.selectedElement).toBe(media.closest("figure"))
      expect(editor.toHTML(true)).toBe(authored)
    }
    selection.selectElement(document.querySelector("p")!)
    expect(media).not.toHaveClass("◆element-capture-selected", "◆element-selected")
  })

  it("promotes clicks and interior selections to the outer media node", () => {
    document.body.innerHTML = `
      <picture><source srcset="small.png"><img src="large.png"></picture>
      <video controls><source src="movie.mp4"></video>
    `
    const picture = document.querySelector("picture")!
    const image = picture.querySelector("img")!
    $.selectRange(image, 0)
    editor.features.selection.processSelection()
    expect($.selectedElement).toBe(picture)

    const pictureSource = picture.querySelector("source")!
    $.selectElement(pictureSource)
    editor.features.selection.processSelection()
    expect($.selectedElement).toBe(picture)

    const video = document.querySelector("video")!
    video.querySelector("source")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    expect($.selectedElement).toBe(video)
  })

  it("inserts semantic defaults and selects the new empty media", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "picture"})
    const picture = document.querySelector("picture")!

    expect(picture.querySelector(":scope > img")).not.toBeNull()
    expect($.selectedElement).toBe(picture)
    expect(editor.toHTML(true)).toBe("<picture><img></picture><p></p>")

    $.selectGap(picture)
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const video = document.querySelector("video")!
    expect(video).toHaveAttribute("controls")
    expect($.selectedElement).toBe(video)
  })

  it("keeps the interactive empty state in the shadow appendix", async () => {
    document.body.innerHTML = "<audio controls></audio>"
    const audio = document.querySelector("audio")!
    $.selectElement(audio)
    editor.features.selection.processSelection()
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    const placeholderController = editor.features.media.placeholder
    const placeholder = placeholderController.element
    expect(audio).toHaveClass("◆media-empty")
    expect(placeholder.getRootNode()).toBe(editor.appendix)
    expect(placeholder).toHaveAttribute("data-open")
    expect(placeholder).toHaveAttribute("data-media", "audio")
    expect(getComputedStyle(placeholder).backgroundColor).toBe("rgba(31, 41, 55, 0.5)")
    const selectionZIndex = editorStyleString.match(/body::part\(selection-caret\)\s*\{[^}]*z-index:\s*(\d+)/)![1]
    const dragZIndex = editorStyleString.match(/body::part\(node-drag-surface\)\s*\{[^}]*z-index:\s*(\d+)/)![1]
    const transformZIndex = editorStyleString.match(/body::part\(transform-overlay\)\s*\{[^}]*z-index:\s*(\d+)/)![1]
    const placeholderZIndex = Number(getComputedStyle(placeholder).zIndex)
    expect(placeholderZIndex).toBeGreaterThanOrEqual(Number(selectionZIndex))
    expect(placeholderZIndex).toBeGreaterThan(Number(dragZIndex))
    expect(placeholderZIndex).toBeLessThan(Number(transformZIndex))
    expect(placeholderController.root.querySelector(".hint")).toBeNull()
    expect(Array.from(placeholderController.root.querySelector(".content")!.children)).toContain(
      placeholderController.root.querySelector(".url-row"),
    )
    const style = Array.from(placeholderController.root.adoptedStyleSheets[0].cssRules, rule => rule.cssText).join("\n")
    expect(style).toMatch(/\.content\s*\{[\s\S]*?display:\s*flex;/)
    expect(getComputedStyle(placeholderController.root.querySelector(".content")!).flexWrap).toBe("wrap")
    expect(getComputedStyle(placeholder).overflow).toBe("clip")
    expect(style).toMatch(/container-type:\s*size;/)
    expect(style).toMatch(/@container \(max-height:\s*5\.25rem\)[\s\S]*?flex-wrap:\s*nowrap;/)
    expect(style).toMatch(/@container \(max-width:\s*30rem\)[\s\S]*?\.file-options \.label\s*\{[\s\S]*?display:\s*none;/)
    const buttons = Array.from(placeholderController.root.querySelectorAll<HTMLButtonElement>(".file-options button"))
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Select file", "Capture screen", "Record"])
    expect(buttons.map(button => button.querySelector("svg")?.classList.toString())).toEqual([
      expect.stringContaining("icon-tabler-folder-open"),
      expect.stringContaining("icon-tabler-screen-share"),
      expect.stringContaining("icon-tabler-player-record"),
    ])
    expect(placeholderController.root.querySelectorAll('.icon[aria-hidden="true"] svg')).toHaveLength(5)
    const apply = placeholderController.root.querySelector<HTMLButtonElement>(".apply")!
    expect(apply).toHaveAccessibleName("Apply URL")
    expect(apply.querySelector(".icon-tabler-arrow-right")).not.toBeNull()
    expect(apply.parentElement).toBe(placeholderController.root.querySelector(".url-row"))
    expect(getComputedStyle(apply).position).toBe("absolute")
    expect(getComputedStyle(apply).padding).toBe("2px")
    expect(getComputedStyle(apply).borderRadius).toBe("50%")
    expect(getComputedStyle(apply).backgroundColor).toBe("rgba(255, 255, 255, 0.5)")
    expect(getComputedStyle(apply.parentElement!).position).toBe("relative")
    expect(document.body.querySelector("svg, .file-options, .url-row")).toBeNull()
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toMatch(/svg|icon-tabler|Media source/)
    expect(document.body.children).toHaveLength(1)
    expect(editor.toHTML(true)).toBe("<audio controls=\"\"></audio>")
  })

  it("shortens the URL hint as the input shrinks and restores it when it grows", () => {
    document.body.innerHTML = "<audio controls></audio>"
    const audio = document.querySelector("audio")!
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    const rect = vi.spyOn(input, "getBoundingClientRect")
    rect.mockReturnValue(new DOMRect(0, 0, 300, 35))
    placeholder.showFor(audio)
    expect(input.placeholder).toBe("Enter audio URL")
    rect.mockReturnValue(new DOMRect(0, 0, 100, 35))
    placeholder.showFor(audio)
    expect(input.placeholder).toBe("URL")
    expect(input.getAttribute("aria-label")).toBe("Audio URL")
    rect.mockReturnValue(new DOMRect(0, 0, 300, 35))
    placeholder.showFor(audio)
    expect(input.placeholder).toBe("Enter audio URL")
  })

  it("keeps empty media source entry in view after the editing viewport is resized", () => {
    document.body.innerHTML = '<audio controls></audio>'
    const audio = document.querySelector("audio")!
    editor.features.media.placeholder.showFor(audio)
    const scroll = vi.spyOn(audio, "scrollIntoView").mockImplementation(() => {})
    window.dispatchEvent(new Event("resize"))
    expect(scroll).toHaveBeenCalledWith({block: "nearest", inline: "nearest"})
    scroll.mockClear()
    audio.setAttribute("src", "recording.mp3")
    window.dispatchEvent(new Event("resize"))
    expect(scroll).not.toHaveBeenCalled()
  })

  it("keeps the placeholder within the visible viewport portion of a large media target", () => {
    document.body.innerHTML = "<audio controls></audio>"
    const audio = document.querySelector("audio")!
    vi.spyOn(audio, "getBoundingClientRect").mockReturnValue(new DOMRect(-40, 200, 500, 200))
    const width = Object.getOwnPropertyDescriptor(window, "innerWidth")
    const height = Object.getOwnPropertyDescriptor(window, "innerHeight")
    Object.defineProperty(window, "innerWidth", {configurable: true, value: 320})
    Object.defineProperty(window, "innerHeight", {configurable: true, value: 240})
    try {
      editor.features.media.placeholder.showFor(audio)
      const overlay = editor.features.media.placeholder.element
      expect(overlay.style.left).toBe("0px")
      expect(overlay.style.top).toBe("200px")
      expect(overlay.style.width).toBe("320px")
      expect(overlay.style.height).toBe("40px")
    }
    finally {
      if(width) Object.defineProperty(window, "innerWidth", width)
      if(height) Object.defineProperty(window, "innerHeight", height)
    }
  })

  it("opens tiny image inputs in an appendix popover and cleans up on resize, replacement and hiding", () => {
    document.body.innerHTML = "<picture><img></picture><picture><img></picture>"
    const [image, other] = Array.from(document.querySelectorAll("picture"))
    const rect = vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 32, 32))
    vi.spyOn(other, "getBoundingClientRect").mockReturnValue(new DOMRect(50, 10, 32, 32))
    const placeholder = editor.features.media.placeholder
    const content = placeholder.root.querySelector<HTMLElement>(".content")!
    const expand = placeholder.root.querySelector<HTMLButtonElement>(".expand")!
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    content.showPopover = vi.fn()
    content.hidePopover = vi.fn()
    placeholder.showFor(image)
    expect(placeholder.element).toHaveAttribute("data-compact")
    expect(content).toHaveAttribute("popover", "auto")
    expect(expand).toHaveAccessibleName("Add image")
    expect(expand).toHaveAttribute("aria-expanded", "false")
    expand.click()
    expect(content.showPopover).toHaveBeenCalledOnce()
    expect(placeholder.element).toHaveAttribute("data-popup-open")
    expect(expand).toHaveAttribute("aria-expanded", "true")
    expect(placeholder.root.activeElement).toBe(input)
    input.value = "https://example.com/image.png"
    placeholder.onSource = vi.fn()
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    expect(placeholder.onSource).toHaveBeenCalledWith(image, "https://example.com/image.png")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    expect(placeholder.element).not.toHaveAttribute("data-popup-open")
    expect(placeholder.root.activeElement).toBe(expand)
    expand.click()
    placeholder.showFor(other)
    expect(placeholder.element).not.toHaveAttribute("data-popup-open")
    expect(input.value).toBe("")
    placeholder.showFor(image)
    expand.click()
    rect.mockReturnValue(new DOMRect(10, 10, 400, 200))
    placeholder.showFor(image)
    expect(placeholder.element).not.toHaveAttribute("data-compact")
    expect(content).not.toHaveAttribute("popover")
    expect(content).not.toHaveAttribute("style")
    rect.mockReturnValue(new DOMRect(10, 10, 32, 32))
    placeholder.showFor(image)
    expand.click()
    placeholder.hide()
    expect(placeholder.element).not.toHaveAttribute("data-popup-open")
    expect(expand).toHaveAttribute("aria-expanded", "false")
    expect(placeholder.element.getRootNode()).toBe(editor.appendix)
    expect(editor.toHTML(true)).not.toMatch(/popover|media-inputs|Add image/)
  })

  it("fits a passive SVG image placeholder icon into a 32px image", async () => {
    document.body.innerHTML = '<svg><image width="32" height="32"></image></svg>'
    const image = document.querySelector("svg image")!
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 32, 32))
    await vi.waitFor(() => expect(editor.appendix.querySelector('[part="graphic-image-placeholder"] svg')).not.toBeNull())
    const icon = editor.appendix.querySelector<SVGSVGElement>('[part="graphic-image-placeholder"] svg')!
    expect(icon.style.width).toBe("18px")
    expect(icon.style.height).toBe("18px")
    expect(icon.style.maxWidth).toBe("100%")
    expect(icon.style.maxHeight).toBe("100%")
    expect(editor.toHTML(true)).not.toContain("icon-tabler")
  })

  it("distinguishes selected and passive empty-media placeholders", async () => {
    document.body.innerHTML = "<audio controls></audio><video controls></video>"
    await Promise.resolve()
    const audio = document.querySelector("audio")!
    const video = document.querySelector("video")!

    audio.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    expect(audio).toHaveClass("◆media-empty", "◆element-selected")
    expect(video).toHaveClass("◆media-empty")
    expect(video).not.toHaveClass("◆element-selected")
    expect(editor.features.media.placeholder.target).toBe(audio)

    video.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    expect(audio).not.toHaveClass("◆element-selected")
    expect(video).toHaveClass("◆media-empty", "◆element-selected")
    expect(editor.features.media.placeholder.target).toBe(video)
    expect(editor.features.media.placeholder.element).toHaveAttribute("data-media", "video")
  })

  it("shows passive SVG image placeholders in the appendix without changing authored structure", async () => {
    document.body.innerHTML = '<svg viewBox="0 0 800 600"><!--keep--><g transform="translate(10 20)"><image x="5" y="7" width="100" height="60"></image><title>Image group</title></g><image width="200" height="100"></image><image href="photo.png"></image></svg>'
    const images = Array.from(document.querySelectorAll<SVGGraphicsElement>("svg image"))
    images.forEach((image, index) => vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(20 + index * 120, 60, 100, 60)))
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll('[part="graphic-image-placeholder"]')).toHaveLength(2))
    const placeholders = Array.from(editor.appendix.querySelectorAll<HTMLDivElement>('[part="graphic-image-placeholder"]'))
    expect(placeholders.map(placeholder => placeholder.textContent)).toEqual(["Add an image", "Add an image"])
    expect(placeholders.every(placeholder => !placeholder.hidden && placeholder.getRootNode() === editor.appendix)).toBe(true)
    expect(placeholders[0].style.left).toBe("20px")
    expect(placeholders[0].style.width).toBe("100px")
    expect(editor.features.media.placeholder.element).not.toHaveAttribute("data-open")
    editor.doc.syncFromDOM()
    const html = editor.toHTML(true)
    expect(html).toContain('<!--keep--><g transform="translate(10 20)"><image x="5" y="7" width="100" height="60"></image><title>Image group</title></g>')
    expect(html).not.toMatch(/◆|placeholder|Add an image/)
    expect(editor.doc.body.toString()).not.toMatch(/◆|placeholder|Add an image/)
  })

  it("positions SVG image placeholders using current native geometry and group transforms", async () => {
    document.body.innerHTML = '<svg><g transform="rotate(90)"><image x="5" y="7" width="100" height="60"></image></g></svg>'
    const image = document.querySelector<SVGGraphicsElement>("svg image")!
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 120, 200))
    Object.defineProperty(image, "getBBox", {value: () => new DOMRect(5, 7, 100, 60)})
    let matrix = {a: 0, b: 2, c: -2, d: 0, e: 100, f: 50}
    Object.defineProperty(image, "getScreenCTM", {value: () => matrix})
    await vi.waitFor(() => expect(editor.appendix.querySelector('[part="graphic-image-placeholder"]')).not.toBeNull())
    const placeholder = editor.appendix.querySelector<HTMLDivElement>('[part="graphic-image-placeholder"]')!
    expect(placeholder.style.transform).toBe("matrix(0, 1, -1, 0, 86, 60)")
    expect([placeholder.style.width, placeholder.style.height]).toEqual(["200px", "120px"])
    matrix = {...matrix, e: 150, f: 90}
    document.dispatchEvent(new Event("scroll"))
    await vi.waitFor(() => expect(placeholder.style.transform).toBe("matrix(0, 1, -1, 0, 136, 100)"))
    image.setAttribute("style", "visibility: hidden")
    await vi.waitFor(() => expect(placeholder.hidden).toBe(true))
    image.removeAttribute("style")
    await vi.waitFor(() => expect(placeholder.hidden).toBe(false))
  })

  it("removes SVG image placeholders after source updates, removal, widget moves and disable", async () => {
    document.body.innerHTML = '<svg><image width="100" height="60"></image></svg><media-widget></media-widget>'
    const image = document.querySelector("svg image")!
    const count = () => editor.appendix.querySelectorAll('[part="graphic-image-placeholder"]').length
    await vi.waitFor(() => expect(count()).toBe(1))
    image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "remote.png")
    await vi.waitFor(() => expect(count()).toBe(0))
    image.removeAttributeNS("http://www.w3.org/1999/xlink", "href")
    await vi.waitFor(() => expect(count()).toBe(1))
    const svg = image.parentElement!
    document.querySelector("media-widget")!.append(svg)
    await vi.waitFor(() => expect(count()).toBe(0))
    expect(image).not.toHaveClass("◆media-empty")
    document.body.prepend(svg)
    await vi.waitFor(() => expect(count()).toBe(1))
    image.remove()
    await vi.waitFor(() => expect(count()).toBe(0))
    svg.append(image)
    await vi.waitFor(() => expect(count()).toBe(1))
    editor.features.media.disable()
    expect(count()).toBe(0)
    expect(image).not.toHaveClass("◆media-empty")
  })

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "overlays the %s input affordance with the same translucent background", media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media === "img" ? "picture" : ["embed", "object"].includes(media) ? "iframe" : media)!
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 320, 180))
      const placeholder = editor.features.media.placeholder
      placeholder.showFor(target)

      const style = getComputedStyle(placeholder.element)
      expect(style.backgroundColor).toBe("rgba(31, 41, 55, 0.5)")
      expect(style.position).toBe("fixed")
      expect([style.left, style.top, style.width, style.height]).toEqual(["20px", "60px", "320px", "180px"])
      expect(placeholder.element.getRootNode()).toBe(editor.appendix)
      const shield = editor.appendix.querySelector(".◆media-interaction-shield")
      if(shield) expect(Number(style.zIndex)).toBeGreaterThan(Number(getComputedStyle(shield).zIndex))
    },
  )

  it.each(["iframe", "embed", "object"])("shows the website icon only while %s is empty", async tag => {
    document.body.innerHTML = `<${tag}></${tag}>`
    editor.schema.enforceMedia(document.body)
    const target = document.querySelector("iframe")!
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 320, 180))
    await vi.waitFor(() => expect(editor.appendix.querySelector("[data-empty-website]")).not.toBeNull())
    const shield = editor.appendix.querySelector<HTMLElement>("[data-empty-website]")!
    const icon = shield.shadowRoot!.querySelector(".icon-tabler-world-www")!
    expect(icon).not.toBeNull()
    const style = getComputedStyle(icon)
    expect(style.color).toBe("#6b7280")
    expect(style.left).toBe("50%")
    expect(style.top).toBe("50%")
    expect(style.transform).toBe("translate(-50%, -50%)")
    expect(document.body.querySelector("svg")).toBeNull()
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toMatch(/svg|data-empty-website/)
    expect(editor.toHTML(true)).not.toMatch(/svg|data-empty-website/)

    target.setAttribute("src", "about:blank")
    await vi.waitFor(() => expect(shield).not.toHaveAttribute("data-empty-website"))
    target.removeAttribute("src")
    await vi.waitFor(() => expect(shield).toHaveAttribute("data-empty-website"))
    target.remove()
    await vi.waitFor(() => expect(shield.isConnected).toBe(false))
  })

  it("keeps the inactive media placeholder hidden under the editing CSP", () => {
    const placeholder = editor.features.media.placeholder

    expect(placeholder.root.querySelector("style")).toBeNull()
    expect(placeholder.root.adoptedStyleSheets.length).toBeGreaterThan(0)
    expect(getComputedStyle(placeholder.element).display).toBe("none")
    expect(placeholder.element).not.toHaveAttribute("data-open")
  })

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "applies an HTTP URL to the %s source by clicking the inset arrow", media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media === "img" ? "picture" : ["embed", "object"].includes(media) ? "iframe" : media)!
      const sourceTarget = ["picture", "img"].includes(media) ? target.querySelector("img")! : target
      const placeholder = editor.features.media.placeholder
      const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
      input.value = "  https://example.com/media?query=1#section  "
      placeholder.root.querySelector(".apply svg")!.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true}))

      expect(sourceTarget.getAttribute("src")).toBe("https://example.com/media?query=1#section")
      expect(placeholder.element).not.toHaveAttribute("data-open")
      expect(document.body.querySelector("svg, button, input")).toBeNull()
    },
  )

  it.each(["", "example.com/movie.mp4", "/movie.mp4", "//example.com/movie.mp4", "http://", "https://exa mple.com", "ftp://example.com/movie.mp4", "file:///movie.mp4", "about:blank", "data:video/mp4;base64,AAAA", "javascript:alert(1)"])(
    "rejects a non-HTTP or malformed URL without changing the document: %s", source => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
      const placeholder = editor.features.media.placeholder
      const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
      const before = editor.toHTML(true)
      input.value = source
      placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()

      expect(input).toHaveAttribute("aria-invalid", "true")
      expect(input.validity.customError).toBe(true)
      expect(input.validationMessage).toContain("http:// or https://")
      expect(placeholder.root.activeElement).toBe(input)
      expect(placeholder.element).toHaveAttribute("data-open")
      expect(editor.toHTML(true)).toBe(before)
    },
  )

  it("clears an error on editing and applies a corrected HTTP URL with Enter", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "audio"})
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    input.value = "invalid"
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(input).toHaveAttribute("aria-invalid", "true")

    input.value = "http://example.com/audio.mp3"
    input.dispatchEvent(new Event("input", {bubbles: true}))
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(input.validity.valid).toBe(true)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(document.querySelector("audio")).toHaveAttribute("src", "http://example.com/audio.mp3")
  })

  it("rejects empty and HTTP website URLs before changing a website source", () => {
    document.body.innerHTML = "<iframe></iframe>"
    const frame = document.querySelector("iframe")!
    $.selectElement(frame)
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    placeholder.showFor(frame)
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.validationMessage).toContain("https://")
    expect(frame.hasAttribute("src")).toBe(false)
    input.value = "http://example.com/blocked"
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.validationMessage).toContain("https://")
    expect(frame.hasAttribute("src")).toBe(false)

    expect(() => editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "src", value: "http://example.com/blocked"}))
      .toThrow("Enter a valid https:// website URL.")
    expect(frame.hasAttribute("src")).toBe(false)
  })

  it("clears URL errors when switching to another empty media element", async () => {
    document.body.innerHTML = "<audio controls></audio><video controls></video>"
    document.querySelector("audio")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    input.value = "invalid"
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    input.blur()
    await Promise.resolve()
    document.querySelector("video")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))

    expect(placeholder.target).toBe(document.querySelector("video"))
    expect(input.value).toBe("")
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(input.validity.customError).toBe(false)
  })

  it.each(["replace", "populate", "widget"])("does not apply a stale URL after a concurrent %s change", change => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const video = document.querySelector("video")!
    const placeholder = editor.features.media.placeholder
    placeholder.root.querySelector<HTMLInputElement>(".url")!.value = "https://example.com/movie.mp4"
    if(change === "replace") video.replaceWith(document.createElement("video"))
    else if(change === "populate") video.setAttribute("src", "remote.mp4")
    else {
      const widget = document.createElement("media-widget")
      video.replaceWith(widget)
      widget.append(video)
    }
    const before = editor.toHTML(true)
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()
    expect(editor.toHTML(true)).toBe(before)
  })

  it("opens the matching native file picker from an insertion action", () => {
    const placeholder = editor.features.media.placeholder
    const picker = placeholder.root.querySelector<HTMLInputElement>(".picker")!
    const open = vi.spyOn(picker, "click").mockImplementation(() => {})
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "picture", selectFile: true})

    expect(open).toHaveBeenCalledOnce()
    expect(picker.accept).toBe("image/*")
    expect(picker.getRootNode()).toBe(placeholder.root)
    expect(placeholder.target).toBe(document.querySelector("picture"))
    expect(editor.toHTML(true)).toBe("<picture><img></picture><p></p>")
    open.mockRestore()
  })

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "capture-selects %s when its placeholder controls receive keyboard focus", async media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media === "img" ? "picture" : ["embed", "object"].includes(media) ? "iframe" : media)!
      const placeholder = editor.features.media.placeholder
      const html = editor.toHTML(true)

      for(const selector of [".file", ".url"]) {
        const control = placeholder.root.querySelector<HTMLElement>(selector)!
        control.focus()
        await Promise.resolve()

        expect(editor.features.selection.captureSelectedElement).toBe(target)
        expect(target).toHaveClass("◆element-selected", "◆element-capture-selected")
        expect(placeholder.root.activeElement).toBe(control)
        expect(placeholder.element).toHaveAttribute("data-open")
        expect(editor.toHTML(true)).toBe(html)
      }
    },
  )

  it("ignores placeholder focus after its media has been replaced", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const placeholder = editor.features.media.placeholder
    document.querySelector("video")!.replaceWith(document.createElement("video"))

    placeholder.root.querySelector<HTMLInputElement>(".url")!.focus()

    expect(editor.features.selection.captureSelectedElement).toBeNull()
  })

  it("keeps placeholder text unselectable while allowing entered URLs to be selected", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "audio"})
    const root = editor.features.media.placeholder.root
    const input = root.querySelector<HTMLInputElement>(".url")!
    const placeholderRule = Array.from(root.adoptedStyleSheets[0].cssRules)
      .find(rule => rule instanceof CSSStyleRule && rule.selectorText === ".url:placeholder-shown") as CSSStyleRule

    expect(placeholderRule.style.userSelect).toBe("none")
    expect(placeholderRule.style.getPropertyValue("-webkit-user-select")).toBe("none")
    input.value = "https://example.com/audio.mp3"
    expect(getComputedStyle(input).userSelect).toBe("text")
  })

  it("preserves native URL editing while the media is capture-selected", async () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const video = document.querySelector("video")!
    editor.features.selection.captureElement(video)
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    input.value = "https://example.com/movie.mp4"
    const selectElement = vi.spyOn($, "selectElement")
    getSelection()!.removeAllRanges()

    input.focus()
    input.select()
    document.dispatchEvent(new Event("selectionchange"))
    editor.features.selection.processSelection()
    await Promise.resolve()

    expect(placeholder.root.activeElement).toBe(input)
    expect(editor.features.selection.captureSelectedElement).toBe(video)
    expect(video).toHaveClass("◆element-capture-selected")
    expect(selectElement).not.toHaveBeenCalled()
    expect(getSelection()!.rangeCount).toBe(0)
    expect(editor.features.media.getState()?.type).toBe("video")
    const style = getComputedStyle(input)
    expect(style.caretColor).toBe("auto")
    expect(style.userSelect).toBe("text")
    const focusRule = Array.from(placeholder.root.adoptedStyleSheets[0].cssRules)
      .find(rule => rule instanceof CSSStyleRule && rule.selectorText === "input:focus") as CSSStyleRule
    expect(focusRule.style.outlineStyle).toBe("none")
    const selectionRule = Array.from(placeholder.root.adoptedStyleSheets[0].cssRules)
      .find(rule => rule instanceof CSSStyleRule && rule.selectorText === ".url::selection") as CSSStyleRule
    expect(selectionRule.style.backgroundColor).toBe("#0078d7")
    selectElement.mockRestore()
  })

  it("keeps the empty-media affordance open while its URL input has focus", async () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const video = document.querySelector("video")!
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!

    input.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true}))
    getSelection()!.removeAllRanges()
    input.focus()
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    expect(placeholder.root.activeElement).toBe(input)
    expect(placeholder.target).toBe(video)
    expect(placeholder.element).toHaveAttribute("data-open")
    expect(video).toHaveClass("◆element-selected", "◆element-capture-selected")
  })

  it("keeps the empty-media affordance open when the file picker returns without a file", async () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "audio"})
    const audio = document.querySelector("audio")!
    const placeholder = editor.features.media.placeholder
    const fileButton = placeholder.root.querySelector<HTMLButtonElement>(".file")!
    const picker = placeholder.root.querySelector<HTMLInputElement>(".picker")!
    vi.spyOn(picker, "click").mockImplementation(() => {})

    fileButton.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true}))
    getSelection()!.removeAllRanges()
    fileButton.focus()
    fileButton.click()
    picker.dispatchEvent(new Event("cancel"))
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()

    expect(picker.click).toHaveBeenCalledOnce()
    expect(placeholder.root.activeElement).toBe(fileButton)
    expect(placeholder.target).toBe(audio)
    expect(placeholder.element).toHaveAttribute("data-open")
    expect(audio).toHaveClass("◆element-selected", "◆element-capture-selected")
  })

  it("keeps uploaded files as object URLs and embeds them only on saving", async () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "img"})
    const image = document.querySelector("img")!
    const picker = editor.features.media.placeholder.root.querySelector<HTMLInputElement>(".picker")!
    Object.defineProperty(picker, "files", {configurable: true, value: [new File(["image"], "photo.png", {type: "image/png"})]})
    picker.dispatchEvent(new Event("change"))
    await vi.waitFor(() => {
      expect(image.getAttribute("src")).toMatch(/^blob:/)
    }, {timeout: 5_000})
    const source = image.getAttribute("src")!
    expect(editor.toHTML(true)).toContain(source)
    expect(editor.features.media.getState()).toMatchObject({sourceSize: 5, sourceLabel: "photo.png"})
    expect(await editor.serializeHTML()).toContain(`data:image/png;base64,${btoa("image")}`)
    expect(image.getAttribute("src")).toBe(source)
  })

  it("retains object URLs while disabled and revokes them at destruction", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL")
    const source = editor.createMediaURL(new Blob(["audio"], {type: "audio/mpeg"}))
    document.body.innerHTML = `<audio src="${source}"></audio><template><object data="${source}"></object></template><svg><image href="${source}"></image></svg><picture><source srcset="${source} 2x"><img src="${source}" alt="${source}"></picture>`
    const saved = new DOMParser().parseFromString(await editor.serializeHTML(), "text/html")
    const data = `data:audio/mpeg;base64,${btoa("audio")}`
    expect(saved.querySelector("audio")!.getAttribute("src")).toBe(data)
    expect(saved.querySelector("template")!.content.querySelector("object")!.getAttribute("data")).toBe(data)
    expect(saved.querySelector("svg image")!.getAttribute("href")).toBe(data)
    expect(saved.querySelector("source")!.getAttribute("srcset")).toBe(`${data} 2x`)
    expect(saved.querySelector("img")!.getAttribute("alt")).toBe(source)
    editor.features.media.disable()
    expect(revoke).not.toHaveBeenCalledWith(source)
    editor.destroy()
    expect(revoke).toHaveBeenCalledWith(source)
  })

  it.each(["populated", "moved into a widget", "feature disabled", "editor destroyed"])(
    "ignores a file selection after its target is %s", state => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media: "img"})
      const image = document.querySelector("img")!
      const picker = editor.features.media.placeholder.root.querySelector<HTMLInputElement>(".picker")!
      Object.defineProperty(picker, "files", {configurable: true, value: [new File(["image"], "photo.png", {type: "image/png"})]})
      if(state === "populated") image.setAttribute("src", "remote.png")
      else if(state === "moved into a widget") {
        const widget = document.createElement("media-widget")
        image.replaceWith(widget)
        widget.append(image)
      }
      else if(state === "feature disabled") editor.features.media.disable()
      else editor.destroy()
      picker.dispatchEvent(new Event("change"))
      expect(image.getAttribute("src")).toBe(state === "populated" ? "remote.png" : null)
    },
  )

  it("edits advanced attributes and retains the picture container", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "picture"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "alt", value: "A diagram"})
    expect(document.querySelector("picture > img")).toHaveAttribute("alt", "A diagram")

    editor.features.media.actions.switchImageType({type: "switchImageType", image: "img"})
    const image = document.body.firstElementChild!
    expect(image.localName).toBe("picture")
    expect(image.querySelector("img")).toHaveAttribute("alt", "A diagram")
    expect($.selectedElement).toBe(image)

    editor.features.media.actions.switchImageType({type: "switchImageType", image: "picture"})
    expect(document.body.firstElementChild?.localName).toBe("picture")
    expect(document.querySelector("picture > img")).toHaveAttribute("alt", "A diagram")
  })

  it.each(["audio", "video"] as const)("updates the live %s muted state with its authored attribute", async media => {
    document.body.innerHTML = `<${media} src="recording.mp3"></${media}>`
    const player = document.querySelector(media)!
    $.selectElement(player)

    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "muted", value: ""})
    expect(player).toHaveAttribute("muted")
    expect(player.muted).toBe(true)

    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "muted", value: null})
    expect(player).not.toHaveAttribute("muted")
    expect(player.muted).toBe(false)

    player.setAttribute("muted", "")
    await vi.waitFor(() => expect(player.muted).toBe(true))
  })

  it("syncs the muted property for newly added media subtrees", async () => {
    const section = document.createElement("section")
    section.innerHTML = '<audio muted></audio>'
    document.body.append(section)
    const audio = section.querySelector("audio")!
    await vi.waitFor(() => expect(audio.muted).toBe(true))

    const widget = document.createElement("media-widget")
    document.body.append(widget)
    await Promise.resolve()
    const widgetAudio = document.createElement("audio")
    widget.append(widgetAudio)
    await Promise.resolve()
    widgetAudio.setAttribute("muted", "")
    widgetAudio.muted = false
    await Promise.resolve()
    expect(widgetAudio.muted).toBe(false)
  })

  it("manages direct sources and tracks without rebuilding fallback content", () => {
    document.body.innerHTML = `<audio controls>
      <source src="first.mp3" type="audio/mpeg">
      <template data-keep><span>Player helper</span></template>
      <source src="second.ogg" type="audio/ogg">
      <track kind="captions" src="captions.vtt" srclang="en" label="English">
      <p data-fallback>Download the recording.</p>
    </audio>`
    const audio = document.querySelector("audio")!
    const fallback = audio.querySelector("p")!
    const helper = audio.querySelector("template")!
    $.selectElement(audio)
    editor.features.selection.processSelection()

    let state = editor.features.media.getState()!
    expect(state.sources?.map(source => source.attributes.src)).toEqual(["first.mp3", "second.ogg"])
    expect(state.tracks?.[0].attributes).toEqual(expect.objectContaining({kind: "captions", srclang: "en"}))
    expect(state.fallbackHTML).toContain('<p data-fallback="">Download the recording.</p>')

    expect(editor.features.media.actions.addTimedMediaResource({
      type: "addTimedMediaResource", resource: "source",
    })).toBe(true)
    expect(audio.querySelectorAll(":scope > source")).toHaveLength(3)
    expect(audio.querySelectorAll(":scope > track")).toHaveLength(1)
    expect(audio.querySelector("p")).toBe(fallback)
    expect(audio.querySelector("template")).toBe(helper)

    state = editor.features.media.getState()!
    const added = state.sources!.at(-1)!
    expect(editor.features.media.actions.setTimedMediaResourceAttribute({
      type: "setTimedMediaResourceAttribute",
      resource: "source",
      index: added.index,
      expected: added.attributes,
      name: "src",
      value: "third.wav",
    })).toBe(true)

    state = editor.features.media.getState()!
    const third = state.sources!.at(-1)!
    expect(editor.features.media.actions.moveTimedMediaResource({
      type: "moveTimedMediaResource",
      resource: "source",
      index: third.index,
      expected: third.attributes,
      direction: -1,
    })).toBe(true)
    expect(Array.from(audio.querySelectorAll(":scope > source"), source => source.getAttribute("src")))
      .toEqual(["first.mp3", "third.wav", "second.ogg"])

    state = editor.features.media.getState()!
    const first = state.sources![0]
    expect(editor.features.media.actions.removeTimedMediaResource({
      type: "removeTimedMediaResource",
      resource: "source",
      index: first.index,
      expected: first.attributes,
    })).toBe(true)
    expect(Array.from(audio.querySelectorAll(":scope > source"), source => source.getAttribute("src")))
      .toEqual(["third.wav", "second.ogg"])

    expect(editor.features.media.actions.addTimedMediaResource({
      type: "addTimedMediaResource", resource: "track",
    })).toBe(true)
    state = editor.features.media.getState()!
    const addedTrack = state.tracks!.at(-1)!
    expect(addedTrack.attributes.kind).toBe("subtitles")
    expect(editor.features.media.actions.setTimedMediaResourceAttribute({
      type: "setTimedMediaResourceAttribute",
      resource: "track",
      index: addedTrack.index,
      expected: addedTrack.attributes,
      name: "srclang",
      value: "de",
    })).toBe(true)
    state = editor.features.media.getState()!
    const germanTrack = state.tracks!.at(-1)!
    expect(editor.features.media.actions.moveTimedMediaResource({
      type: "moveTimedMediaResource",
      resource: "track",
      index: germanTrack.index,
      expected: germanTrack.attributes,
      direction: -1,
    })).toBe(true)
    expect(Array.from(audio.querySelectorAll(":scope > track"), track => track.getAttribute("srclang")))
      .toEqual(["de", "en"])
    state = editor.features.media.getState()!
    const englishTrack = state.tracks![1]
    expect(editor.features.media.actions.removeTimedMediaResource({
      type: "removeTimedMediaResource",
      resource: "track",
      index: englishTrack.index,
      expected: englishTrack.attributes,
    })).toBe(true)
    expect(audio.querySelectorAll(":scope > track")).toHaveLength(1)
    expect(audio.querySelector("p")).toBe(fallback)
    expect(audio.querySelector("template")).toBe(helper)
  })

  it("edits scoped fallback HTML while preserving resources and stripping active content", () => {
    document.body.innerHTML = '<video controls><source src="movie.mp4"><track src="captions.vtt"><p>Old fallback</p></video>'
    const video = document.querySelector("video")!
    const source = video.querySelector("source")!
    const track = video.querySelector("track")!
    $.selectElement(video)
    editor.features.selection.processSelection()
    const expected = editor.features.media.getState()!.fallbackHTML!

    expect(editor.features.media.actions.setTimedMediaFallbackHTML({
      type: "setTimedMediaFallbackHTML",
      expected,
      html: '<dialog><hgroup><p class="download">Download <a href="movie.mp4">the movie</a>.</p></hgroup></dialog><script>alert(1)</script>',
    })).toEqual({changed: true, removedUnsafeItems: 3})

    expect(video.querySelector("source")).toBe(source)
    expect(video.querySelector("track")).toBe(track)
    expect(video.querySelector("script, dialog, hgroup")).toBeNull()
    expect(video.querySelector("p.download")?.textContent).toBe("Download the movie.")
    expect($.selectedElement).toBe(video)
  })

  it("fails safely when a resource row changed after its state was read", () => {
    document.body.innerHTML = '<video><source src="movie.mp4"></video>'
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.selection.processSelection()
    const sourceState = editor.features.media.getState()!.sources![0]
    video.querySelector("source")!.setAttribute("src", "remote.webm")

    expect(editor.features.media.actions.setTimedMediaResourceAttribute({
      type: "setTimedMediaResourceAttribute",
      resource: "source",
      index: sourceState.index,
      expected: sourceState.attributes,
      name: "type",
      value: "video/mp4",
    })).toBe(false)
    expect(video.querySelector("source")).not.toHaveAttribute("type")
    expect(video.querySelector("source")).toHaveAttribute("src", "remote.webm")
  })

  it("adds and removes an image map beside a picture without disturbing its figure", () => {
    document.body.innerHTML = '<figure><picture><img src="diagram.png" alt="Diagram"></picture><figcaption>Overview</figcaption></figure>'
    const picture = document.querySelector("picture")!
    const image = picture.querySelector("img")!
    const caption = document.querySelector("figcaption")!
    $.selectElement(picture)
    editor.features.selection.processSelection()

    expect(editor.features.media.getState()?.imageMap).toBeNull()
    expect(editor.features.media.actions.addImageMap({type: "addImageMap"})).toBe(true)

    const map = document.querySelector("map")!
    expect(image).toHaveAttribute("usemap", "#image-map")
    expect(map).toHaveAttribute("name", "image-map")
    expect(map.previousElementSibling).toBe(picture)
    expect(map.nextElementSibling).toBe(caption)
    expect(editor.features.media.getState()?.imageMap).toEqual({name: "image-map", shared: false, areas: []})
    expect(editor.toHTML(true)).toContain('<map name="image-map"></map>')

    expect(editor.features.media.actions.removeImageMap({type: "removeImageMap"})).toEqual({removedMap: true})
    expect(image).not.toHaveAttribute("usemap")
    expect(map.isConnected).toBe(false)
    expect(document.querySelector("figcaption")).toBe(caption)
  })

  it("edits nested hotspots by guarded paths and preserves irregular map structure", () => {
    document.body.innerHTML = `
      <img src="campus.png" usemap="#campus" alt="Campus">
      <map name="campus" data-origin="imported"><span data-group><area shape="rect" coords="1,2,30,40" href="old.html" alt="Library"></span></map>
    `
    const image = document.querySelector("img")!
    const map = document.querySelector("map")!
    const wrapper = map.querySelector("span")!
    $.selectElement(image)
    editor.features.selection.processSelection()

    let areaState = editor.features.media.getState()!.imageMap!.areas[0]
    expect(areaState.path).toHaveLength(2)
    expect(editor.features.media.actions.setImageMapAreaAttribute({
      type: "setImageMapAreaAttribute",
      path: areaState.path,
      expected: areaState.attributes,
      name: "href",
      value: "library.html",
    })).toBe(true)
    expect(map.querySelector("area")).toHaveAttribute("href", "library.html")
    expect(map.querySelector("span")).toBe(wrapper)
    expect(map).toHaveAttribute("data-origin", "imported")

    areaState = editor.features.media.getState()!.imageMap!.areas[0]
    wrapper.prepend(document.createComment("remote shift"))
    expect(editor.features.media.actions.removeImageMapArea({
      type: "removeImageMapArea",
      path: areaState.path,
      expected: areaState.attributes,
    })).toBe(false)
    expect(map.querySelector("area")).not.toBeNull()

    areaState = editor.features.media.getState()!.imageMap!.areas[0]
    expect(editor.features.media.actions.removeImageMapArea({
      type: "removeImageMapArea",
      path: areaState.path,
      expected: areaState.attributes,
    })).toBe(true)
    expect(map.isConnected).toBe(false)
    expect(wrapper.isConnected).toBe(true)
    expect(wrapper.firstChild).toBeInstanceOf(Comment)
    expect(image).not.toHaveAttribute("usemap")
  })

  it("unlinks a shared image map without deleting it for other images", () => {
    document.body.innerHTML = '<img id="first" usemap="#shared"><img id="second" usemap="#shared"><map name="shared"><area shape="default" href="home.html" alt="Home"></map>'
    const first = document.querySelector<HTMLImageElement>("#first")!
    const second = document.querySelector<HTMLImageElement>("#second")!
    const map = document.querySelector("map")!
    $.selectElement(first)
    editor.features.selection.processSelection()

    expect(editor.features.media.getState()?.imageMap?.shared).toBe(true)
    expect(editor.features.media.actions.removeImageMap({type: "removeImageMap"})).toEqual({removedMap: false})
    expect(first).not.toHaveAttribute("usemap")
    expect(second).toHaveAttribute("usemap", "#shared")
    expect(map.isConnected).toBe(true)
  })

  it("draws rectangle, circle, and polygon hotspots in intrinsic image coordinates", () => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"></map>'
    const image = document.querySelector<HTMLImageElement>("img")!
    Object.defineProperty(image, "naturalWidth", {configurable: true, value: 200})
    Object.defineProperty(image, "naturalHeight", {configurable: true, value: 100})
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
      x: 10, y: 20, left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50, toJSON: () => ({}),
    })
    $.selectElement(image)
    editor.features.selection.processSelection()
    const overlay = editor.features.media.imageMapOverlay
    const svg = overlay.root.querySelector<SVGSVGElement>("svg")!
    expect(overlay.element.getRootNode()).toBe(editor.appendix)

    expect(editor.features.media.actions.startImageMapDrawing({type: "startImageMapDrawing", shape: "rect"})).toBe(true)
    svg.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 20, clientY: 30}))
    svg.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 60, clientY: 50}))
    svg.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 60, clientY: 50}))

    expect(editor.features.media.actions.startImageMapDrawing({type: "startImageMapDrawing", shape: "circle"})).toBe(true)
    svg.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 35, clientY: 45}))
    svg.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 60, clientY: 45}))

    expect(editor.features.media.actions.startImageMapDrawing({type: "startImageMapDrawing", shape: "poly"})).toBe(true)
    for(const [clientX, clientY] of [[20, 30], [60, 30], [40, 60]]) {
      svg.dispatchEvent(new MouseEvent("click", {bubbles: true, detail: 1, clientX, clientY}))
    }
    overlay.root.querySelector<HTMLButtonElement>(".finish")!.click()

    expect(Array.from(document.querySelectorAll("area"), area => ({
      shape: area.getAttribute("shape"), coords: area.getAttribute("coords"), alt: area.getAttribute("alt"),
    }))).toEqual([
      {shape: "rect", coords: "20,20,100,60", alt: ""},
      {shape: "circle", coords: "50,50,50", alt: ""},
      {shape: "poly", coords: "20,20,100,20,60,80", alt: ""},
    ])
    expect(editor.toHTML(true)).not.toContain("image-map-overlay")
  })

  it("moves captured hotspots, resizes their vertices, and ignores concurrent replacements", () => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"><area shape="rect" coords="10,10,40,40"></map>'
    const image = document.querySelector<HTMLImageElement>("img")!
    mockImageGeometry(image, 100, 100, 100, 100)
    editor.features.selection.captureElement(image)
    editor.features.media["refresh"]()
    const overlay = editor.features.media.imageMapOverlay
    const svg = overlay.root.querySelector("svg")!
    const area = document.querySelector("area")!
    const down = (element: Element, x: number, y: number) => element.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: x, clientY: y}))
    const up = (x: number, y: number) => svg.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: x, clientY: y}))
    down(overlay.root.querySelector(".hotspot")!, 20, 20)
    up(30, 25)
    expect(area.getAttribute("coords")).toBe("20,15,50,45")
    expect(overlay.root.querySelectorAll(".handle")).toHaveLength(4)
    down(overlay.root.querySelectorAll(".handle")[1], 50, 45)
    up(70, 60)
    expect(area.getAttribute("coords")).toBe("20,15,70,60")
    down(overlay.root.querySelector(".hotspot")!, 30, 30)
    area.setAttribute("coords", "1,2,3,4")
    up(40, 40)
    expect(area.getAttribute("coords")).toBe("1,2,3,4")
    expect(editor.toHTML(true)).not.toContain("image-map-overlay")
  })

  it("creates editable authored popovers and switches their trigger without rebuilding content", () => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"><area shape="circle" coords="20,20,10"></map>'
    const image = document.querySelector<HTMLImageElement>("img")!
    $.selectElement(image)
    editor.features.selection.processSelection()
    const state = () => editor.features.media.getState()!.imageMap!.areas[0]
    let area = state()
    expect(editor.features.media.actions.addImageMapPopover({type: "addImageMapPopover", path: area.path, expected: area.attributes})).toBe(true)
    const content = document.querySelector<HTMLElement>("[popover]")!
    const paragraph = content.querySelector("p")!
    paragraph.innerHTML = '<strong>Arbitrary</strong> content'
    $.selectElement(image)
    editor.features.selection.processSelection()
    area = state()
    expect(editor.features.media.actions.setImageMapPopoverTrigger({type: "setImageMapPopoverTrigger", path: area.path, expected: area.attributes, value: "hover"})).toBe(true)
    expect(document.querySelector("area")).toHaveAttribute("interestfor", content.id)
    expect(document.querySelector("area")).not.toHaveAttribute("popovertarget")
    expect(content.querySelector("p")).toBe(paragraph)
    const show = vi.fn()
    content.showPopover = show
    document.querySelector("area")!.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    expect(show).toHaveBeenCalled()
    expect(editor.toHTML(true)).toContain('<strong>Arbitrary</strong> content')
    expect(editor.toHTML()).toContain('document.addEventListener("pointerover", handle)')
    expect(editor.toHTML(false, false)).not.toContain('document.addEventListener("pointerover", handle)')
  })

  it("undoes and redoes hotspot popover creation as authored DOM", async () => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"><area shape="rect" coords="10,10,40,40"></map>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.features.selection.captureElement(document.querySelector("img")!)
    const area = editor.features.media.getState()!.imageMap!.areas[0]
    expect(editor.features.media.actions.addImageMapPopover({type: "addImageMapPopover", path: area.path, expected: area.attributes})).toBe(true)
    expect(editor.features.selection.captureSelectedElement).toBeNull()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.doc.undo()
    await Promise.resolve()
    expect(document.querySelector("[popover]")).toBeNull()
    expect(document.querySelector("area")).not.toHaveAttribute("popovertarget")
    editor.doc.redo()
    await Promise.resolve()
    const content = document.querySelector<HTMLElement>("[popover]")!
    expect(content.querySelector("p")!.textContent).toBe("Popover content")
    expect(document.querySelector("area")).toHaveAttribute("popovertarget", content.id)
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it.each(["Backspace", "Delete"])("removes the selected hotspot with %s without removing the image", key => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"><area shape="rect" coords="10,10,40,40"></map>'
    const image = document.querySelector<HTMLImageElement>("img")!
    mockImageGeometry(image, 100, 100, 100, 100)
    editor.features.selection.captureElement(image)
    editor.features.media["refresh"]()
    const overlay = editor.features.media.imageMapOverlay
    overlay.root.querySelector(".hotspot")!.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 20, clientY: 20}))
    overlay.root.querySelector("svg")!.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 20, clientY: 20}))
    const event = new KeyboardEvent("keydown", {key, bubbles: true, composed: true, cancelable: true})
    overlay.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(image.isConnected).toBe(true)
    expect(document.querySelector("area, map")).toBeNull()
    expect(image).not.toHaveAttribute("usemap")
  })

  it("edits hotspot URLs in the appendix and switches back to the same popover content", () => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"><area shape="rect" coords="10,10,80,80"></map>'
    const image = document.querySelector<HTMLImageElement>("img")!
    mockImageGeometry(image, 100, 100, 100, 100)
    editor.features.selection.captureElement(image)
    editor.features.media["refresh"]()
    const overlay = editor.features.media.imageMapOverlay
    const control = overlay.root.querySelector<HTMLDivElement>(".actions")!
    expect(control.getRootNode()).toBe(overlay.root)
    const input = control.querySelector<HTMLInputElement>("input")!
    control.querySelector<HTMLButtonElement>(".link")!.click()
    expect(control.querySelector("form")).not.toHaveAttribute("hidden")
    input.value = "https://example.org/library"
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
    expect(control.querySelector("form")).toHaveAttribute("hidden")
    const area = document.querySelector("area")!
    expect(area).toHaveAttribute("href", "https://example.org/library")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, composed: true}))
    expect(area.isConnected).toBe(true)
    control.querySelector<HTMLButtonElement>(".popover")!.click()
    const content = document.querySelector<HTMLElement>("[popover]")!
    content.querySelector("p")!.innerHTML = '<em>Keep this content</em>'
    const id = content.id
    control.querySelector<HTMLButtonElement>(".link")!.click()
    expect(area).not.toHaveAttribute("popovertarget")
    expect(area).toHaveAttribute("href", "https://example.org/library")
    expect(area).toHaveAttribute("aria-details", id)
    control.querySelector<HTMLButtonElement>(".popover")!.click()
    expect(document.querySelectorAll("[popover]")).toHaveLength(1)
    expect(area).toHaveAttribute("popovertarget", id)
    expect(content.querySelector("em")!.textContent).toBe("Keep this content")
    expect(editor.toHTML(true)).not.toMatch(/url-editor|action-buttons|Hotspot URL/)
  })

  it("positions popovers beside hotspots, flips at viewport edges, and cleans up presentation styles", () => {
    document.body.innerHTML = '<img src="plan.png" width="100" height="100" usemap="#plan"><map name="plan"><area shape="rect" coords="60,20,80,40" popovertarget="details"></map><div id="details" popover="auto"><p>Content</p></div>'
    const image = document.querySelector<HTMLImageElement>("img")!, area = document.querySelector("area")!, content = document.querySelector<HTMLElement>("#details")!
    let imageLeft = 10
    vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => new DOMRect(imageLeft, 10, 100, 100))
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 120, 80))
    let opened = false
    content.showPopover = () => { opened = true }
    content.hidePopover = () => { opened = false }
    const matches = content.matches.bind(content)
    vi.spyOn(content, "matches").mockImplementation(selector => selector === ":popover-open" ? opened : matches(selector))
    const original = document.adoptedStyleSheets
    const authored = content.outerHTML
    const controller = createImageMapPopoverController(document)
    expect(imageMapHotspotBounds(area, image)).toMatchObject({left:70, right:90, top:30, bottom:50})
    expect(controller.open(area, image)).toBe(true)
    const sheet = document.adoptedStyleSheets.at(-1)!
    const style = () => (sheet.cssRules[0] as CSSStyleRule).style
    expect(style().left).toBe("98px")
    expect(style().top).toBe("8px")
    expect(style().borderRadius).toBe("0.5rem")
    imageLeft = window.innerWidth - 100
    controller.refresh()
    expect(parseFloat(style().left)).toBe(window.innerWidth - 100 + 60 - 8 - 120)
    expect(content.outerHTML).toBe(authored)
    expect(controller.open(area, image, true)).toBe(true)
    expect(opened).toBe(false)
    controller.dispose()
    expect(document.adoptedStyleSheets).toEqual(original)
  })

  it("cancels a first hotspot without leaving an empty map or editor markers", () => {
    document.body.innerHTML = '<img src="plan.png">'
    const image = document.querySelector<HTMLImageElement>("img")!
    mockImageGeometry(image, 100, 100, 100, 100)
    editor.features.selection.captureElement(image)
    const authored = editor.toHTML(true)
    expect(editor.features.media.actions.startImageMapDrawing({type: "startImageMapDrawing", shape: "rect"})).toBe(true)
    expect(document.querySelector("map")).toBeNull()
    const overlay = editor.features.media.imageMapOverlay
    overlay.root.querySelector<HTMLButtonElement>(".cancel")!.click()
    expect(overlay.isDrawing).toBe(false)
    expect(overlay.element).not.toHaveAttribute("data-open")
    expect(image).not.toHaveAttribute("usemap")
    expect(editor.toHTML(true)).toBe(authored)
  })

  it.each([
    ["circle", "20,20,10", "25,25,10", "25,25,20"],
    ["poly", "10,10,40,10,20,40", "15,15,45,15,25,45", "15,15,45,15,55,55"],
  ])("moves and resizes a %s hotspot", (shape, initial, moved, resized) => {
    document.body.innerHTML = `<img src="plan.png" usemap="#plan"><map name="plan"><area shape="${shape}" coords="${initial}"></map>`
    const image = document.querySelector<HTMLImageElement>("img")!
    mockImageGeometry(image, 100, 100, 100, 100)
    editor.features.selection.captureElement(image)
    editor.features.media["refresh"]()
    const overlay = editor.features.media.imageMapOverlay, svg = overlay.root.querySelector("svg")!
    const down = (element: Element, x: number, y: number) => element.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: x, clientY: y}))
    const up = (x: number, y: number) => svg.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: x, clientY: y}))
    down(overlay.root.querySelector(".hotspot")!, 20, 20)
    up(25, 25)
    expect(document.querySelector("area")!.getAttribute("coords")).toBe(moved)
    down(overlay.root.querySelectorAll(".handle")[shape === "circle" ? 0 : 2], 35, 25)
    up(shape === "circle" ? 45 : 55, shape === "circle" ? 25 : 55)
    expect(document.querySelector("area")!.getAttribute("coords")).toBe(resized)
    down(overlay.root.querySelector(".hotspot")!, 20, 20)
    svg.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 35, clientY: 35}))
    svg.dispatchEvent(new PointerEvent("pointercancel", {bubbles: true}))
    expect(document.querySelector("area")!.getAttribute("coords")).toBe(resized)
  })

  it("drawing adds a map and deleting the last hotspot unlinks all its images", () => {
    document.body.innerHTML = '<img src="plan.png">'
    const image = document.querySelector<HTMLImageElement>("img")!
    mockImageGeometry(image, 100, 100, 100, 100)
    $.selectElement(image)
    editor.features.selection.processSelection()
    expect(editor.features.media.actions.startImageMapDrawing({type: "startImageMapDrawing", shape: "rect"})).toBe(true)
    const svg = editor.features.media.imageMapOverlay.root.querySelector("svg")!
    svg.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 10, clientY: 10}))
    svg.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 40, clientY: 40}))
    const second = image.cloneNode() as HTMLImageElement
    image.after(second)
    const area = editor.features.media.getState()!.imageMap!.areas[0]
    expect(editor.features.media.actions.removeImageMapArea({type: "removeImageMapArea", path: area.path, expected: area.attributes})).toBe(true)
    expect(document.querySelector("map")).toBeNull()
    expect(image).not.toHaveAttribute("usemap")
    expect(second).not.toHaveAttribute("usemap")
  })

  it("cancels hotspot drawing when the image geometry changes", () => {
    document.body.innerHTML = '<img src="plan.png" usemap="#plan"><map name="plan"></map>'
    const image = document.querySelector<HTMLImageElement>("img")!
    let width = 100
    vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, left: 0, top: 0, right: width, bottom: 100, width, height: 100, toJSON: () => ({}),
    }))
    $.selectElement(image)
    editor.features.selection.processSelection()
    expect(editor.features.media.actions.startImageMapDrawing({type: "startImageMapDrawing", shape: "rect"})).toBe(true)
    const overlay = editor.features.media.imageMapOverlay
    const svg = overlay.root.querySelector<SVGSVGElement>("svg")!
    svg.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 10, clientY: 10}))
    width = 200
    svg.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 60, clientY: 60}))

    expect(document.querySelector("area")).toBeNull()
    expect(overlay.isDrawing).toBe(false)
  })

  it("converts selected media to a figure without replacing an existing semantic ancestor", () => {
    document.body.innerHTML = '<article data-origin="remote"><picture><img src="diagram.png" alt="Diagram"></picture><p>Explanation</p></article>'
    const image = document.querySelector("picture")!
    $.selectElement(image)
    editor.features.selection.processSelection()

    expect(editor.features.media.actions.wrapMediaInFigure({type: "wrapMediaInFigure"})).toBe(true)

    expect(editor.toHTML(true)).toBe('<article data-origin="remote"><figure id="figure"><picture><img src="diagram.png" alt="Diagram"></picture></figure><p>Explanation</p></article>')
    expect($.selectedElement).toBe(image.closest("figure"))
    // Caption controls target the top-level article, rather than its nested figure.
    expect(editor.features.manipulation.getFigureState()).toBeNull()
    expect(editor.features.media.actions.wrapMediaInFigure({type: "wrapMediaInFigure"})).toBe(false)
    expect(document.querySelectorAll("figure")).toHaveLength(1)
  })

  it("retains iframe when legacy website switches are requested", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "iframe"})
    const frame = document.querySelector("iframe")!
    for(const website of ["embed", "object"] as const) {
      editor.features.media.actions.switchWebsiteType({type: "switchWebsiteType", website})
      expect(document.querySelector("iframe")).toBe(frame)
      expect(document.querySelector("embed, object")).toBeNull()
    }
  })

  it("capture-selects interactive media through an appendix shield and blocks same-click activation", async () => {
    document.body.innerHTML = '<iframe src="about:blank#frame"></iframe><audio src="sound.mp3"></audio>'
    const [iframe, audio] = Array.from(document.body.children)
    const rect = {x: 0, y: 0, left: 0, top: 0, right: 160, bottom: 80, width: 160, height: 80, toJSON: () => ({})}
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(rect)
    vi.spyOn(audio, "getBoundingClientRect").mockReturnValue(rect)
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(2))

    const shield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!
    const nativeActivation = vi.fn()
    iframe.addEventListener("click", nativeActivation)
    const pointerdown = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
    shield.dispatchEvent(pointerdown)
    shield.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, cancelable: true, button: 0}))
    shield.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    await vi.waitFor(() => expect(shield.isConnected).toBe(false))

    expect(pointerdown.defaultPrevented).toBe(true)
    expect(nativeActivation).not.toHaveBeenCalled()
    expect($.selectedElement).toBe(iframe)
    expect(editor.features.selection.isCaptureSelection).toBe(true)
    expect(editor.toHTML(true)).toBe('<iframe src="about:blank#frame"></iframe><audio src="sound.mp3" controls=""></audio>')
  })

  it("shields timed media controls but not widget-owned or nested media", async () => {
    document.body.innerHTML = `
      <audio src="outer.mp3"><video src="nested.mp4"></video></audio>
      <media-widget><iframe src="about:blank#widget"></iframe></media-widget>
      <video></video>
    `
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(2))
    const shield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!
    expect(shield.isConnected).toBe(true)
    expect(document.querySelector("audio > .◆media-interaction-shield")).toBeNull()
    expect(document.querySelector("media-widget iframe")?.classList.contains("◆media-interaction-shield")).toBe(false)
    expect(document.querySelector("video:not([src])")?.classList.contains("◆media-interaction-shield")).toBe(false)
  })

  it("treats a srcdoc-only iframe as interactive while keeping a blank iframe on the placeholder path", async () => {
    document.body.innerHTML = ""
    const contentFrame = document.createElement("iframe")
    contentFrame.srcdoc = "<p>child content</p>"
    const blankFrame = document.createElement("iframe")
    document.body.append(contentFrame, blankFrame)
    const rect = {x: 0, y: 0, left: 0, top: 0, right: 160, bottom: 80, width: 160, height: 80, toJSON: () => ({})}
    vi.spyOn(contentFrame, "getBoundingClientRect").mockReturnValue(rect)
    vi.spyOn(blankFrame, "getBoundingClientRect").mockReturnValue(rect)

    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(2))
    expect(contentFrame).not.toHaveClass("◆media-empty")
    expect(blankFrame).toHaveClass("◆media-empty")

    $.selectElement(blankFrame)
    editor.features.selection.processSelection()
    document.dispatchEvent(new Event("selectionchange"))
    await vi.waitFor(() => expect(editor.features.media.placeholder.target).toBe(blankFrame))

    const shield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!
    shield.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    expect($.selectedElement).toBe(contentFrame)
    expect(editor.features.selection.isCaptureSelection).toBe(true)
  })

  it.each(['<iframe></iframe>', '<iframe srcdoc=""></iframe>', '<audio controls=""></audio>', '<video controls=""></video>'])(
    "capture-selects empty native media through its surface and opens the source controls: %s", async html => {
      document.body.innerHTML = `<p>text</p>${html}`
      const frame = document.querySelector("iframe, audio, video")!
      vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 320, 180))
      await vi.waitFor(() => expect(editor.appendix.querySelector(".◆media-interaction-shield")).not.toBeNull())
      const shield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!

      const down = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0})
      shield.dispatchEvent(down)
      shield.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, composed: true, cancelable: true, button: 0}))
      shield.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true, cancelable: true}))
      await vi.waitFor(() => expect(shield.isConnected).toBe(true))

      expect(down.defaultPrevented).toBe(true)
      expect($.selectedElement).toBe(frame)
      expect(editor.features.selection.captureSelectedElement).toBe(frame)
      expect(frame).toHaveClass("◆element-selected", "◆media-empty")
      expect(frame).toHaveClass("◆element-capture-selected")
      const placeholder = editor.features.media.placeholder
      expect(placeholder.target).toBe(frame)
      expect(placeholder.element).toHaveAttribute("data-open")
      expect(editor.toHTML(true)).toBe(`<p>text</p>${html}`)

      editor.features.selection.actions.selectNode({type: "selectNode", path: [0]})
      document.dispatchEvent(new Event("selectionchange"))
      await vi.waitFor(() => expect(editor.appendix.querySelector(".◆media-interaction-shield")).not.toBeNull())
      expect(placeholder.element).not.toHaveAttribute("data-open")
    },
  )

  it("does not let invisible media shields intercept clicks and hides zero-sized surfaces", async () => {
    document.body.innerHTML = `
      <p>before</p>
      <iframe src="about:blank#hidden" hidden></iframe>
      <audio src="sound.mp3" style="visibility: hidden"></audio>
      <video src="movie.mp4" style="visibility: collapse"></video>
      <embed src="movie.swf" style="display: none">
      <iframe src="about:blank#zero"></iframe>
    `
    const zero = document.querySelector<HTMLIFrameElement>("iframe:last-of-type")!
    vi.spyOn(zero, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}),
    })
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(1))

    const shield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!
    expect(shield.hidden).toBe(true)
    expect(getComputedStyle(shield).display).toBe("none")
    expect(document.querySelector("iframe[hidden]")?.classList.contains("◆media-empty")).toBe(false)
    expect(document.querySelector("audio")?.classList.contains("◆media-empty")).toBe(false)
  })

  it.each(["", 'src="data:video/mp4;base64,"'])("removes hidden disclosure media shields and restores them on expansion: %s", async source => {
    document.body.innerHTML = `<details><summary>Heading</summary><!--keep--><div><video controls ${source}></video></div></details>`
    const details = document.querySelector("details")!, video = document.querySelector("video")!
    // Happy DOM has no rendering or checkVisibility; model the browser's
    // retained hidden box separately from its native visibility result.
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 320, 180))
    const visibility = vi.fn(() => details.open)
    Object.defineProperty(video, "checkVisibility", {configurable: true, value: visibility})
    await vi.waitFor(() => expect(visibility).toHaveBeenCalled())
    expect(editor.appendix.querySelector(".◆media-interaction-shield")).toBeNull()
    const authored = editor.toHTML(true)
    details.open = true
    await vi.waitFor(() => expect(editor.appendix.querySelector(".◆media-interaction-shield")).not.toBeNull())
    const shield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!
    details.open = false
    // Revalidate immediately: the observer may not have removed the shield
    // when authored or remote code closes the disclosure before a click.
    shield.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true, button: 0}))
    expect(details.open).toBe(false)
    expect(editor.features.selection.captureSelectedElement).not.toBe(video)
    await vi.waitFor(() => expect(shield.isConnected).toBe(false))
    expect(editor.toHTML(true)).toBe(authored)
    details.open = true
    await vi.waitFor(() => expect(editor.appendix.querySelector(".◆media-interaction-shield")).not.toBeNull())
    editor.features.media.disable()
    expect(editor.appendix.querySelector(".◆media-interaction-shield")).toBeNull()
  })

  it("removes shields when media is removed or the feature is disabled", async () => {
    document.body.innerHTML = '<iframe src="about:blank#frame"></iframe>'
    const iframe = document.querySelector("iframe")!
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, toJSON: () => ({}),
    })
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(1))
    iframe.remove()
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(0))

    document.body.innerHTML = '<audio src="sound.mp3"></audio>'
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(1))
    editor.features.media.disable()
    expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(0)
  })

  it("repositions shields and restores them when another media owns capture", async () => {
    document.body.innerHTML = '<iframe src="about:blank#frame"></iframe><audio src="sound.mp3"></audio>'
    const [iframe, audio] = Array.from(document.body.children)
    let width = 100
    vi.spyOn(iframe, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, left: 0, top: 0, right: width, bottom: 50, width, height: 50, toJSON: () => ({}),
    }))
    vi.spyOn(audio, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 60, left: 0, top: 60, right: 100, bottom: 110, width: 100, height: 50, toJSON: () => ({}),
    })
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(2))

    const iframeShield = editor.appendix.querySelector<HTMLElement>(".◆media-interaction-shield")!
    width = 220
    window.dispatchEvent(new Event("resize"))
    await vi.waitFor(() => expect(iframeShield.style.width).toBe("220px"))

    iframeShield.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    iframeShield.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    await vi.waitFor(() => expect($.selectedElement).toBe(iframe))

    const audioShield = Array.from(editor.appendix.querySelectorAll<HTMLElement>(".◆media-interaction-shield"))
      .find(shield => shield !== iframeShield)!
    audioShield.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
    expect($.selectedElement).toBe(audio)
    expect(editor.features.selection.captureSelectedElement).toBe(audio)
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(2))
  })
})

describe("canonical media", () => {
  it("preserves direct and shared media structure while enabling native controls", async () => {
    document.body.innerHTML = '<p><img alt="Image"></p><embed src="https://example.com/site"><video></video><media-widget><img><video></video></media-widget>'
    const image = document.querySelector("img")!
    $.selectElement(image)
    editor.features.selection.processSelection()
    await vi.waitFor(() => {
      expect(image.parentElement?.localName).toBe("p")
      expect(document.querySelector("embed")).toHaveAttribute("src", "https://example.com/site")
      expect(document.querySelector("video")).toHaveAttribute("controls")
    })
    expect($.selectedElement).toBe(image)
    expect(document.querySelector("media-widget")!.innerHTML).toBe('<img><video></video>')
    const video = document.querySelector("video")!
    video.removeAttribute("controls")
    await vi.waitFor(() => expect(video).toHaveAttribute("controls"))
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toContain('<p><img alt="Image"></img></p>')
    expect(editor.toHTML(true)).not.toContain('◆')
  })
})


describe("selected media source", () => {
  it.each(["unchanged", "remote change", "disconnected", "disabled", "cancelled", "superseded"])(
    "guards a host file picker when %s", condition => {
      document.body.innerHTML = '<audio src="existing.mp3"></audio><audio src="other.mp3"></audio>'
      const audio = document.querySelector("audio")!
      $.selectElement(audio)
      editor.features.selection.processSelection()
      expect(editor.features.media.actions.selectMediaFile({type: "selectMediaFile", pickerId: "first"})).toBe(true)
      expect(editor.appendix.querySelector('input[type="file"]')).toBeNull()
      const file = new File(["audio"], "song.mp3", {type: "audio/mpeg"})
      if(condition === "remote change") audio.setAttribute("src", "remote.mp3")
      if(condition === "disconnected") audio.remove()
      if(condition === "disabled") editor.features.media.disable()
      if(condition === "cancelled") editor.features.media.actions.setMediaFile({type: "setMediaFile", file: null, pickerId: "first"})
      if(condition === "superseded") editor.features.media.actions.selectMediaFile({type: "selectMediaFile", pickerId: "second"})
      // A host picker remains bound to the original node, even if selection moves.
      $.selectElement(document.querySelectorAll("audio")[condition === "disconnected" ? 0 : 1])
      const changed = editor.features.media.actions.setMediaFile({type: "setMediaFile", file, pickerId: "first"})
      expect(changed).toBe(condition === "unchanged")
      if(condition === "unchanged") expect(audio.getAttribute("src")).toMatch(/^blob:/)
      else expect(audio.getAttribute("src")).toBe(condition === "remote change" ? "remote.mp3" : "existing.mp3")
      expect(document.querySelector('audio[src="other.mp3"]')).not.toBeNull()
      expect(editor.toHTML(true)).not.toContain("◆")
    },
  )

  it("removes timed sources without rebuilding fallback, tracks, or resource elements", () => {
    document.body.innerHTML = '<video src="old.mp4"><!--keep--><source src="alternative.mp4" type="video/mp4"><track src="captions.vtt"><span>Fallback</span></video>'
    const video = document.querySelector("video")!
    const children = Array.from(video.childNodes)
    $.selectElement(video)
    editor.features.selection.processSelection()
    expect(editor.features.media.actions.removeMediaSource({type: "removeMediaSource"})).toBe(true)
    expect(video.hasAttribute("src")).toBe(false)
    expect(video.querySelector("source")!.hasAttribute("src")).toBe(false)
    expect(Array.from(video.childNodes)).toEqual(children)
    expect(video.querySelector("track")!.getAttribute("src")).toBe("captions.vtt")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("removes picture sources while preserving unfamiliar siblings", () => {
    document.body.innerHTML = '<picture><source srcset="wide.png"><!--keep--><img src="image.png" srcset="large.png 2x" alt="Description"></picture>'
    const picture = document.querySelector("picture")!
    const children = Array.from(picture.childNodes)
    $.selectElement(picture)
    editor.features.selection.processSelection()
    editor.features.media.actions.removeMediaSource({type: "removeMediaSource"})
    expect(Array.from(picture.childNodes)).toEqual(children)
    expect(picture.querySelector("img")!.getAttribute("alt")).toBe("Description")
    expect(picture.querySelectorAll('[src], [srcset]')).toHaveLength(0)
  })

  it("opens a replacement picker in the appendix and cleans it up on cancellation", () => {
    document.body.innerHTML = '<audio src="existing.mp3"></audio>'
    const audio = document.querySelector("audio")!
    $.selectElement(audio)
    editor.features.selection.processSelection()
    expect(editor.features.media.actions.selectMediaFile({type: "selectMediaFile"})).toBe(true)
    const picker = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(picker).not.toBeNull()
    expect(document.body.querySelector('input[type="file"]')).toBeNull()
    picker.dispatchEvent(new Event("cancel"))
    expect(picker.isConnected).toBe(false)
    expect(audio.getAttribute("src")).toBe("existing.mp3")
  })

  it("replaces a video poster from an image picker without changing its source or children", () => {
    document.body.innerHTML = '<video src="movie.mp4" poster="old.jpg"><source src="alternate.mp4"><track src="captions.vtt"></video>'
    const video = document.querySelector("video")!
    const children = Array.from(video.childNodes)
    $.selectElement(video)
    editor.features.selection.processSelection()
    expect(editor.features.media.actions.selectMediaFile({type: "selectMediaFile", attribute: "poster"})).toBe(true)
    const picker = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(picker.accept).toBe("image/*")
    Object.defineProperty(picker, "files", {value: [new File(["poster"], "cover.png", {type: "image/png"})]})
    picker.dispatchEvent(new Event("change"))

    expect(video.getAttribute("poster")).toMatch(/^blob:/)
    expect(editor.features.media.getState()?.cover).toMatchObject({label: "cover.png", kind: "file"})
    expect(video.getAttribute("src")).toBe("movie.mp4")
    expect(Array.from(video.childNodes)).toEqual(children)
    expect(video.querySelector("source")?.getAttribute("src")).toBe("alternate.mp4")
    expect(video.querySelector("track")?.getAttribute("src")).toBe("captions.vtt")
    expect(picker.isConnected).toBe(false)
  })

  it.each(["poster changed", "disconnected"])("cleans up a poster picker after a concurrent %s", condition => {
    document.body.innerHTML = '<video src="movie.mp4" poster="old.jpg"></video>'
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.selection.processSelection()
    editor.features.media.actions.selectMediaFile({type: "selectMediaFile", attribute: "poster"})
    const picker = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(picker, "files", {value: [new File(["poster"], "cover.png", {type: "image/png"})]})
    if(condition === "poster changed") video.setAttribute("poster", "remote.jpg")
    else video.remove()
    picker.dispatchEvent(new Event("change"))

    expect(picker.isConnected).toBe(false)
    expect(video.getAttribute("poster")).toBe(condition === "poster changed" ? "remote.jpg" : "old.jpg")
    expect(video.getAttribute("src")).toBe("movie.mp4")
  })

  it("rejects a poster picker for non-video media", () => {
    document.body.innerHTML = '<audio src="sound.mp3"></audio>'
    $.selectElement(document.querySelector("audio")!)
    editor.features.selection.processSelection()

    expect(editor.features.media.actions.selectMediaFile({type: "selectMediaFile", attribute: "poster"})).toBe(false)
    expect(editor.appendix.querySelector('input[type="file"]')).toBeNull()
  })

  it.each([
    ["screen-image", "Capture screenshot"],
    ["camera-image", "Take photo"],
  ] as const)("opens %s capture for the selected video's poster", (mode, label) => {
    document.body.innerHTML = '<video src="movie.mp4" poster="old.jpg"></video>'
    const video = document.querySelector("video")!
    $.selectElement(video)
    editor.features.selection.processSelection()

    expect(editor.features.media.actions.captureSelectedMedia({type: "captureSelectedMedia", mode, attribute: "poster"})).toBe(true)
    const capture = editor.appendix.querySelector<HTMLElement>(".◆media-capture")!
    expect(capture.getRootNode()).toBe(editor.appendix)
    expect(capture.shadowRoot?.querySelector("h2")?.textContent).toBe(label)
    editor.features.media.actions.cancelMediaCapture({type: "cancelMediaCapture"})
    expect(capture.isConnected).toBe(false)
    expect(video.getAttribute("src")).toBe("movie.mp4")
    expect(video.getAttribute("poster")).toBe("old.jpg")
  })
})


it.each(["unchanged", "remote change", "disconnected", "disabled"])("guards replacement file selections when %s", async condition => {
  document.body.innerHTML = '<audio src="existing.mp3"></audio>'
  const audio = document.querySelector("audio")!
  $.selectElement(audio)
  editor.features.selection.processSelection()
  editor.features.media.actions.selectMediaFile({type: "selectMediaFile"})
  const picker = editor.appendix.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(picker, "files", {value: [new File(["audio"], "song.mp3", {type: "audio/mpeg"})]})
  if(condition === "remote change") audio.setAttribute("src", "remote.mp3")
  if(condition === "disconnected") audio.remove()
  if(condition === "disabled") editor.features.media.disable()
  picker.dispatchEvent(new Event("change"))
  if(condition === "unchanged") expect(audio.getAttribute("src")).toMatch(/^blob:/)
  else expect(audio.getAttribute("src")).toBe(condition === "remote change" ? "remote.mp3" : "existing.mp3")
  expect(picker.isConnected).toBe(false)
  if(condition === "unchanged") {
    expect(editor.features.media.getState()).toMatchObject({sourceLabel: "song.mp3", sourceKind: "file"})
    expect(editor.toHTML(true)).not.toContain("song.mp3")
  }
})

describe("media file drag and drop", () => {
  const mediaCases = [
    ["picture", '<picture><source media="(min-width: 20rem)" srcset="old-large.webp"><img src="old-small.png" alt="Keep me"></picture>', "img", "src"],
    ["img", '<img src="old.png" alt="Keep me">', "img", "src"],
    ["audio", '<audio controls><source src="old.mp3" type="audio/mpeg"><track kind="captions" src="captions.vtt"></audio>', "audio", "src"],
    ["video", '<video controls poster="cover.jpg"><source src="old.mp4" type="video/mp4"><track kind="captions" src="captions.vtt"></video>', "video", "src"],
    ["iframe", '<iframe title="Keep me" src="about:blank"></iframe>', "iframe", "src"],
    ["embed", '<embed type="text/html" src="about:blank">', "embed", "src"],
    ["object", '<object type="text/html" data="about:blank"><param name="view" value="full">Fallback</object>', "object", "data"],
  ] as const

  it.each(mediaCases)("replaces the source of a populated %s in place", async (_name, html, selector, attribute) => {
    document.body.innerHTML = html
    const surface = document.querySelector(selector)!
    const file = new File(["replacement"], "replacement.bin", {type: ""})
    const transfer = fileTransfer(file)
    const source = "blob:media-drop-test"
    vi.spyOn(editor, "createMediaURL").mockReturnValue(source)
    const beforeChildren = Array.from(surface.childNodes)
    const over = mediaDragEvent("dragover", transfer)
    surface.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const drop = mediaDragEvent("drop", transfer)
    surface.dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(true)
    expect(editor.createMediaURL).toHaveBeenCalledOnce()
    expect(editor.createMediaURL).toHaveBeenCalledWith(file)
    expect(surface.getAttribute(attribute)).toBe(source)
    expect(Array.from(surface.childNodes)).toEqual(beforeChildren)
    if(selector === "img") expect(surface).toHaveAttribute("alt", "Keep me")
    if(selector === "iframe") expect(surface).toHaveAttribute("title", "Keep me")
    if(selector === "audio" || selector === "video") {
      expect(surface.querySelector("source")?.getAttribute("type")).toMatch(/audio|video/)
      expect(surface.querySelector("source")?.getAttribute("src")).toMatch(/old\.(mp3|mp4)/)
      expect(surface.querySelector("track")?.getAttribute("src")).toBe("captions.vtt")
    }
    if(_name === "picture") expect(document.querySelector("picture source")).not.toHaveAttribute("srcset")
    if(selector === "object") expect(surface.querySelector("param")?.getAttribute("value")).toBe("full")
  })

  it("fills an empty placeholder from the first file and supports the poster action", async () => {
    document.body.innerHTML = "<video controls></video>"
    const video = document.querySelector("video")!
    const file = new File(["poster"], "poster.png", {type: "image/png"})
    const transfer = fileTransfer(file)
    vi.spyOn(editor, "createMediaURL").mockReturnValue("blob:poster-drop")
    editor.features.media["refresh"]()
    $.selectElement(video)
    editor.features.selection.processSelection()
    const placeholder = editor.features.media.placeholder.element
    const drop = mediaDragEvent("drop", transfer)
    placeholder.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(video).toHaveAttribute("src", "blob:poster-drop")

    $.selectElement(video)
    expect(editor.features.media.actions.setMediaFile({type: "setMediaFile", file, attribute: "poster"})).toBe(true)
    expect(video).toHaveAttribute("poster", "blob:poster-drop")
    expect(video).toHaveAttribute("src", "blob:poster-drop")
  })

  it("recognizes file items with an empty MIME type and leaves text drags alone", () => {
    document.body.innerHTML = "<img alt=\"empty\">"
    const image = document.querySelector("img")!
    const transfer = fileTransfer(new File(["file"], "unknown", {type: ""}))
    const over = mediaDragEvent("dragover", transfer)
    image.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const drop = mediaDragEvent("drop", transfer)
    image.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(image.getAttribute("src")).toMatch(/^blob:/)

    const text = new DataTransfer()
    text.setData("text/plain", "ordinary text")
    const textOver = mediaDragEvent("dragover", text)
    editor.features.media.captureListeners.dragover(textOver)
    const textDrop = mediaDragEvent("drop", text)
    editor.features.media.captureListeners.drop(textDrop)
    expect(textOver.defaultPrevented).toBe(false)
    expect(textDrop.defaultPrevented).toBe(false)
    expect(image.getAttribute("src")).toMatch(/^blob:/)
  })

  it.each(["locked", "disabled", "inside widget"])("ignores file drops when media is %s", state => {
    document.body.innerHTML = "<img alt=\"keep\">"
    const image = document.querySelector("img")!
    if(state === "locked") vi.spyOn(editor, "isEditingLocked", "get").mockReturnValue(true)
    if(state === "disabled") editor.features.media.disable()
    if(state === "inside widget") {
      const widget = document.createElement("media-widget")
      image.replaceWith(widget)
      widget.append(image)
    }
    const transfer = fileTransfer(new File(["file"], "photo.png", {type: "image/png"}))
    const createURL = vi.spyOn(editor, "createMediaURL")
    const over = mediaDragEvent("dragover", transfer)
    image.dispatchEvent(over)
    const drop = mediaDragEvent("drop", transfer)
    image.dispatchEvent(drop)
    expect(over.defaultPrevented).toBe(false)
    expect(drop.defaultPrevented).toBe(false)
    expect(createURL).not.toHaveBeenCalled()
    expect(image).not.toHaveAttribute("src")
  })

  it("sets the selected media file source in one undoable edit", async () => {
    document.body.innerHTML = '<picture><source media="(min-width: 20rem)" srcset="large.webp"><img src="old.png" alt="Diagram"></picture>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const picture = document.querySelector("picture")!
    const image = picture.querySelector("img")!
    $.selectElement(picture)
    const file = new File(["new"], "new.png", {type: "image/png"})
    vi.spyOn(editor, "createMediaURL").mockReturnValue("blob:action-file")
    expect(editor.features.media.actions.setMediaFile({type: "setMediaFile", file})).toBe(true)
    expect(image).toHaveAttribute("src", "blob:action-file")
    expect(image).toHaveAttribute("alt", "Diagram")
    expect(picture.querySelector("source")).not.toHaveAttribute("srcset")
    editor.doc.stopCapturing()
    editor.doc.undo()
    await Promise.resolve()
    expect(editor.toHTML(true)).toContain('<img src="old.png" alt="Diagram">')
    editor.doc.redo()
    await Promise.resolve()
    expect(editor.toHTML(true)).toContain('src="blob:action-file"')
  })
})
