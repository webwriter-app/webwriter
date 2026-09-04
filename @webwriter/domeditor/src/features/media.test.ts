// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"

let editor: DOMEditor

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  $.move(document.body.firstElementChild!)
})

afterEach(() => editor.destroy())

describe("media editing", () => {
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
    expect(editor.toHTML(true)).toBe("<picture><img></picture>")

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
    expect(placeholderController.root.querySelector(".hint")).toBeNull()
    expect(Array.from(placeholderController.root.querySelector(".content")!.children)).toContain(
      placeholderController.root.querySelector(".url-row"),
    )
    const style = Array.from(placeholderController.root.adoptedStyleSheets[0].cssRules, rule => rule.cssText).join("\n")
    expect(style).toMatch(/\.content\s*\{[\s\S]*?display:\s*flex;/)
    expect(style).toMatch(/@container \(max-width:\s*34rem\)[\s\S]*?\.content\s*\{[\s\S]*?display:\s*grid;/)
    expect(document.body.children).toHaveLength(1)
    expect(editor.toHTML(true)).toBe("<audio controls=\"\"></audio>")
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
  })

  it("does not replace the empty-document insertion control", () => {
    const insertionButton = editor.appendix.querySelector<HTMLButtonElement>(".◆insertion-add")

    void editor.features.media.placeholder

    expect(insertionButton).not.toBeNull()
    expect(insertionButton?.textContent).toBe("++")
    expect(editor.appendix.querySelector(".◆insertion-add")).toBe(insertionButton)
  })

  it("keeps the inactive media placeholder hidden under the editing CSP", () => {
    const placeholder = editor.features.media.placeholder

    expect(placeholder.root.querySelector("style")).toBeNull()
    expect(placeholder.root.adoptedStyleSheets.length).toBeGreaterThan(0)
    expect(getComputedStyle(placeholder.element).display).toBe("none")
    expect(placeholder.element).not.toHaveAttribute("data-open")
  })

  it("applies direct URLs without adding helper nodes to the authored media", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const video = document.querySelector("video")!
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    input.value = "about:blank#movie.mp4"
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()

    expect(video.getAttribute("src")).toBe("about:blank#movie.mp4")
    expect(video).toHaveAttribute("controls")
    expect(placeholder.element).not.toHaveAttribute("data-open")
    expect(video.children).toHaveLength(0)
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
    expect(video).toHaveClass("◆element-selected")
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
    expect(audio).toHaveClass("◆element-selected")
  })

  it("reads uploaded files as data URLs", async () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "img"})
    const image = document.querySelector("img")!
    const picker = editor.features.media.placeholder.root.querySelector<HTMLInputElement>(".picker")!
    Object.defineProperty(picker, "files", {configurable: true, value: [new File(["image"], "photo.png", {type: "image/png"})]})
    picker.dispatchEvent(new Event("change"))
    await vi.waitFor(() => {
      expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/)
    }, {timeout: 5_000})
  })

  it("edits advanced attributes and switches between picture and img", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "picture"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "alt", value: "A diagram"})
    expect(document.querySelector("picture > img")).toHaveAttribute("alt", "A diagram")

    editor.features.media.actions.switchImageType({type: "switchImageType", image: "img"})
    const image = document.body.firstElementChild!
    expect(image.localName).toBe("img")
    expect(image).toHaveAttribute("alt", "A diagram")
    expect($.selectedElement).toBe(image)

    editor.features.media.actions.switchImageType({type: "switchImageType", image: "picture"})
    expect(document.body.firstElementChild?.localName).toBe("picture")
    expect(document.querySelector("picture > img")).toHaveAttribute("alt", "A diagram")
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
      html: '<p class="download">Download <a href="movie.mp4">the movie</a>.</p><script>alert(1)</script>',
    })).toEqual({changed: true, removedUnsafeItems: 1})

    expect(video.querySelector("source")).toBe(source)
    expect(video.querySelector("track")).toBe(track)
    expect(video.querySelector("script")).toBeNull()
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
    expect(map.querySelector("area")).toBeNull()
    expect(map.querySelector("span")).toBe(wrapper)
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
    document.body.innerHTML = '<article data-origin="remote"><img src="diagram.png" alt="Diagram"><p>Explanation</p></article>'
    const image = document.querySelector("img")!
    $.selectElement(image)
    editor.features.selection.processSelection()

    expect(editor.features.media.actions.wrapMediaInFigure({type: "wrapMediaInFigure"})).toBe(true)

    expect(editor.toHTML(true)).toBe('<article data-origin="remote"><figure><img src="diagram.png" alt="Diagram"></figure><p>Explanation</p></article>')
    expect($.selectedElement).toBe(image)
    expect(editor.features.manipulation.getFigureState()).toEqual({hasCaption: false})
    expect(editor.features.media.actions.wrapMediaInFigure({type: "wrapMediaInFigure"})).toBe(false)
    expect(document.querySelectorAll("figure")).toHaveLength(1)
  })

  it("switches website elements and keeps only attributes supported by the new type", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "iframe"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "src", value: "about:blank#website"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "width", value: "640"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "sandbox", value: "allow-scripts"})

    editor.features.media.actions.switchWebsiteType({type: "switchWebsiteType", website: "embed"})
    const embed = document.querySelector("embed")!
    expect(embed).toHaveAttribute("src", "about:blank#website")
    expect(embed).toHaveAttribute("width", "640")
    expect(embed).not.toHaveAttribute("sandbox")

    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "type", value: "text/html"})
    editor.features.media.actions.switchWebsiteType({type: "switchWebsiteType", website: "object"})
    const object = document.querySelector("object")!
    expect(object).toHaveAttribute("data", "about:blank#website")
    expect(object).not.toHaveAttribute("src")
    expect(object).toHaveAttribute("type", "text/html")
    expect($.selectedElement).toBe(object)
  })
})
