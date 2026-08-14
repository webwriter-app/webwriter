// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
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
    const style = placeholderController.root.querySelector("style")!.textContent
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

  it("applies direct URLs without adding helper nodes to the authored media", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "video"})
    const video = document.querySelector("video")!
    const placeholder = editor.features.media.placeholder
    const input = placeholder.root.querySelector<HTMLInputElement>(".url")!
    input.value = "https://example.test/movie.mp4"
    placeholder.root.querySelector<HTMLButtonElement>(".apply")!.click()

    expect(video.getAttribute("src")).toBe("https://example.test/movie.mp4")
    expect(video).toHaveAttribute("controls")
    expect(placeholder.element).not.toHaveAttribute("data-open")
    expect(video.children).toHaveLength(0)
  })

  it("reads uploaded files as data URLs", async () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "img"})
    const image = document.querySelector("img")!
    const picker = editor.features.media.placeholder.root.querySelector<HTMLInputElement>(".picker")!
    Object.defineProperty(picker, "files", {configurable: true, value: [new File(["image"], "photo.png", {type: "image/png"})]})
    picker.dispatchEvent(new Event("change"))
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/)
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

  it("switches website elements and keeps only attributes supported by the new type", () => {
    editor.features.media.actions.insertMedia({type: "insertMedia", media: "iframe"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "src", value: "https://example.test"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "width", value: "640"})
    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "sandbox", value: "allow-scripts"})

    editor.features.media.actions.switchWebsiteType({type: "switchWebsiteType", website: "embed"})
    const embed = document.querySelector("embed")!
    expect(embed).toHaveAttribute("src", "https://example.test")
    expect(embed).toHaveAttribute("width", "640")
    expect(embed).not.toHaveAttribute("sandbox")

    editor.features.media.actions.setMediaAttribute({type: "setMediaAttribute", name: "type", value: "text/html"})
    editor.features.media.actions.switchWebsiteType({type: "switchWebsiteType", website: "object"})
    const object = document.querySelector("object")!
    expect(object).toHaveAttribute("data", "https://example.test")
    expect(object).not.toHaveAttribute("src")
    expect(object).toHaveAttribute("type", "text/html")
    expect($.selectedElement).toBe(object)
  })
})
