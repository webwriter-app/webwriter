// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"

let editor: DOMEditor

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  document.body.replaceChildren()
  $.selectDocumentStart()
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
