// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {Window as TestWindow} from "happy-dom"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import editorStyleString from "../editor.css?raw"
import {$} from "../utility"

let editor: DOMEditor
const fetchSettings = (window as unknown as TestWindow).happyDOM.settings.fetch
const originalFetchInterceptor = fetchSettings.interceptor

beforeEach(() => {
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
  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "node-selects the %s surface and capture-selects its placeholder controls", async media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media)!
      const placeholder = editor.features.media.placeholder

      for(const selector of [".file", ".file svg", ".url", ".apply"]) {
        target.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0}))
        expect($.selectedElement).toBe(target)
        expect(editor.features.selection.captureSelectedElement).toBeNull()
        expect(target).toHaveClass("◆element-selected")
        expect(target).not.toHaveClass("◆element-capture-selected")

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
  ])("node-selects populated media on repeated surface clicks: %s", html => {
    document.body.innerHTML = html
    const target = document.body.firstElementChild!
    for(let click = 0; click < 2; click++) {
      const down = new PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0})
      target.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true)
      expect($.selectedElement).toBe(target)
      expect(editor.features.selection.captureSelectedElement).toBeNull()
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
    expect(placeholder).toHaveAttribute("data-media", "audio")
    expect(getComputedStyle(placeholder).backgroundColor).toBe("rgba(31, 41, 55, 0.5)")
    const selectionZIndex = editorStyleString.match(/body::part\(selection-caret\)\s*\{[^}]*z-index:\s*(\d+)/)![1]
    expect(Number(getComputedStyle(placeholder).zIndex)).toBeGreaterThan(Number(selectionZIndex))
    expect(placeholderController.root.querySelector(".hint")).toBeNull()
    expect(Array.from(placeholderController.root.querySelector(".content")!.children)).toContain(
      placeholderController.root.querySelector(".url-row"),
    )
    const style = Array.from(placeholderController.root.adoptedStyleSheets[0].cssRules, rule => rule.cssText).join("\n")
    expect(style).toMatch(/\.content\s*\{[\s\S]*?display:\s*flex;/)
    expect(style).toMatch(/@container \(max-width:\s*44rem\)[\s\S]*?\.file-options \.label\s*\{[\s\S]*?display:\s*none;/)
    const buttons = Array.from(placeholderController.root.querySelectorAll<HTMLButtonElement>(".file-options button"))
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Select file", "Capture screen", "Record"])
    expect(buttons.map(button => button.querySelector("svg")?.classList.toString())).toEqual([
      expect.stringContaining("icon-tabler-folder-open"),
      expect.stringContaining("icon-tabler-screen-share"),
      expect.stringContaining("icon-tabler-player-record"),
    ])
    expect(placeholderController.root.querySelectorAll('.icon[aria-hidden="true"] svg')).toHaveLength(4)
    const apply = placeholderController.root.querySelector<HTMLButtonElement>(".apply")!
    expect(apply).toHaveAccessibleName("Apply URL")
    expect(apply.querySelector(".icon-tabler-arrow-right")).not.toBeNull()
    expect(apply.parentElement).toBe(placeholderController.root.querySelector(".url-row"))
    expect(getComputedStyle(apply).position).toBe("absolute")
    expect(getComputedStyle(apply.parentElement!).position).toBe("relative")
    expect(document.body.querySelector("svg, .file-options, .url-row")).toBeNull()
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).not.toMatch(/svg|icon-tabler|Media source/)
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
    expect(editor.features.media.placeholder.element).toHaveAttribute("data-media", "video")
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

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "applies an HTTP URL to the %s source by clicking the inset arrow", media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media)!
      const sourceTarget = media === "picture" ? target.querySelector("img")! : target
      const placeholder = editor.features.media.placeholder
      const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
      input.value = "  https://example.com/media?query=1#section  "
      placeholder.root.querySelector(".apply svg")!.dispatchEvent(new MouseEvent("click", {bubbles: true, composed: true}))

      expect(sourceTarget.getAttribute(media === "object" ? "data" : "src")).toBe("https://example.com/media?query=1#section")
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
    expect(editor.toHTML(true)).toBe("<picture><img></picture>")
    open.mockRestore()
  })

  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)(
    "capture-selects %s when its placeholder controls receive keyboard focus", async media => {
      editor.features.media.actions.insertMedia({type: "insertMedia", media})
      const target = document.querySelector(media)!
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

  it("node-selects interactive media through an appendix shield and blocks same-click activation", async () => {
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
    await vi.waitFor(() => expect(shield.isConnected).toBe(true))

    expect(pointerdown.defaultPrevented).toBe(true)
    expect(nativeActivation).not.toHaveBeenCalled()
    expect($.selectedElement).toBe(iframe)
    expect(editor.features.selection.isCaptureSelection).toBe(false)
    expect(editor.toHTML(true)).toBe('<iframe src="about:blank#frame"></iframe><audio src="sound.mp3" controls=""></audio>')
  })

  it("does not shield empty timed media, widget-owned media, or nested media", async () => {
    document.body.innerHTML = `
      <audio src="outer.mp3"><video src="nested.mp4"></video></audio>
      <media-widget><iframe src="about:blank#widget"></iframe></media-widget>
      <video></video>
    `
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(1))
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
    expect(editor.features.selection.isCaptureSelection).toBe(false)
  })

  it.each(['<iframe></iframe>', '<iframe srcdoc=""></iframe>', '<audio controls=""></audio>', '<video controls=""></video>'])(
    "node-selects empty native media through its surface and opens the source controls: %s", async html => {
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
      expect(editor.features.selection.captureSelectedElement).toBeNull()
      expect(frame).toHaveClass("◆element-selected", "◆media-empty")
      expect(frame).not.toHaveClass("◆element-capture-selected")
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

  it("repositions shields on layout refresh and keeps surfaces shielded after node selection", async () => {
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
    expect(editor.features.selection.isCaptureSelection).toBe(false)
    await vi.waitFor(() => expect(editor.appendix.querySelectorAll(".◆media-interaction-shield")).toHaveLength(2))
  })
})
