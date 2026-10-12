// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {ElementStyleEditor} from "./element-style-editor"
import {specializedStyleDefinitions} from "../element-styles"
import type {ElementStyleState} from "../editor-bridge"

afterEach(() => {document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks()})

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'
const dataURL = `data:image/svg+xml;base64,${btoa(svg)}`

it("distinguishes default markers in both the main group and popup", async () => {
  const {editor, root} = await mount()
  editor.state = {...editor.state, computed: {"list-style-type": "disc"}}
  await editor.updateComplete
  expect(root.querySelector(".specialized-choice-group")!.hasAttribute("data-default")).toBe(true)
  expect(root.querySelector('[aria-label="Disc"]')!.getAttribute("aria-pressed")).toBe("true")
  editor.state = {...editor.state, inline: {"list-style-type": {value: "disc", priority: ""}}}
  await editor.updateComplete
  expect(root.querySelector(".specialized-choice-group")!.hasAttribute("data-default")).toBe(false)
  editor.state = {...editor.state, inline: {}, computed: {"list-style-type": "none"}}
  await editor.updateComplete
  const popup = root.querySelector('[aria-label="More markers"][role="group"]')!
  expect(popup.hasAttribute("data-default")).toBe(true)
  expect(popup.querySelector('[aria-label="None"]')!.getAttribute("aria-pressed")).toBe("true")
})

async function mount(inline: ElementStyleState["inline"] = {}) {
  const editor = new ElementStyleEditor()
  editor.mode = "compact"
  editor.propertyNames = ["list-style-type", "list-style-image"]
  editor.definitions = specializedStyleDefinitions
  editor.state = {target: {localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline,
    computed: {}, context: {display: "block", parentDisplay: "block"}}
  document.body.append(editor)
  await editor.updateComplete
  const changes = vi.fn()
  editor.addEventListener("element-style-change", changes)
  return {editor, root: editor.shadowRoot!, changes}
}

async function openDialog(editor: ElementStyleEditor) {
  editor.shadowRoot!.querySelector<HTMLButtonElement>(".marker-more")!.click()
  await editor.updateComplete
  editor.shadowRoot!.querySelector<HTMLButtonElement>(".marker-image-option")!.click()
  await editor.updateComplete
  await Promise.resolve()
  const dialog = editor.shadowRoot!.querySelector<HTMLDialogElement>("dialog")!
  expect(dialog.open).toBe(true)
  return dialog
}

const submit = (dialog: HTMLDialogElement) => dialog.querySelector("form")!
  .dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
const enterURL = (dialog: HTMLDialogElement, url: string) => {
  const input = dialog.querySelector<HTMLInputElement>('[name="url"]')!
  input.value = url
  input.dispatchEvent(new Event("input", {bubbles: true}))
}

describe("image markers", () => {
  it("lets an existing embedded image be previewed and reapplied without another upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, blob: async () => new Blob([svg], {type: "image/svg+xml"})}))
    const {editor, changes} = await mount({"list-style-image": {value: `url("${dataURL}")`, priority: ""}})
    const dialog = await openDialog(editor)
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(dataURL))
    expect(changes).not.toHaveBeenCalled()
    submit(dialog)
    expect(changes.mock.calls[0][0].detail.styles["--ww-list-marker-image"].value).toBe(`url("${dataURL}")`)
  })

  it("keeps uploads open across equivalent selection refreshes and only applies on Use marker", async () => {
    const {editor, changes} = await mount()
    const dialog = await openDialog(editor)
    const apply = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!
    expect(apply.textContent).toBe("Use marker")
    expect(apply.disabled).toBe(true)
    expect(dialog.textContent).not.toContain("Preview marker")
    const picker = dialog.querySelector<HTMLInputElement>('[name="file"]')!
    Object.defineProperty(picker, "files", {value: [new File([svg], "marker.svg", {type: "image/svg+xml"})]})
    picker.dispatchEvent(new Event("change", {bubbles: true}))
    editor.state = {...editor.state, target: {...editor.state.target!, float: "none"}, inline: {...editor.state.inline}, computed: {"list-style-type": "disc", "list-style-image": "none"}}
    await editor.updateComplete
    expect(dialog.open).toBe(true)
    submit(dialog)
    expect(changes).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(dataURL))
    expect(dialog.open).toBe(true)
    expect(apply.disabled).toBe(false)
    expect(changes).not.toHaveBeenCalled()
    apply.click()
    expect(changes).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(false)
  })

  it("previews the latest URL automatically while allowing edits during loading", async () => {
    let finish!: (response: unknown) => void
    const fetchImage = vi.fn().mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
      .mockResolvedValueOnce({ok: true, blob: async () => new Blob([svg], {type: "image/svg+xml"})})
    vi.stubGlobal("fetch", fetchImage)
    const {editor, changes} = await mount()
    const dialog = await openDialog(editor)
    enterURL(dialog, "https://example.com/first.svg")
    await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledOnce())
    expect(dialog.querySelector<HTMLInputElement>('[name="url"]')!.disabled).toBe(false)
    const firstSignal = fetchImage.mock.calls[0][1].signal as AbortSignal
    enterURL(dialog, "https://example.com/second.svg")
    expect(firstSignal.aborted).toBe(true)
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(dataURL))
    finish({ok: true, blob: async () => new Blob(["old"], {type: "image/png"})})
    await Promise.resolve()
    expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(dataURL)
    expect(dialog.open).toBe(true)
    expect(changes).not.toHaveBeenCalled()
  })

  it("uses the media-style Select file button to activate a hidden image picker", async () => {
    const {editor} = await mount()
    const dialog = await openDialog(editor)
    const picker = dialog.querySelector<HTMLInputElement>('[name="file"]')!
    const button = dialog.querySelector<HTMLButtonElement>('.file-options .file')!
    expect(picker.hidden).toBe(true)
    expect(picker.accept).toBe("image/*")
    expect(button.textContent!.trim()).toBe("Select file")
    expect(button.querySelector("svg")).not.toBeNull()
    const activate = vi.spyOn(picker, "click").mockImplementation(() => {})
    button.click()
    expect(activate).toHaveBeenCalledOnce()
    Object.defineProperty(picker, "files", {value: [new File([svg], "marker.svg", {type: "image/svg+xml"})]})
    picker.dispatchEvent(new Event("change", {bubbles: true}))
    await editor.updateComplete
    expect(dialog.querySelector('.marker-image-filename')!.textContent).toBe("marker.svg")
    const link = dialog.querySelector<HTMLInputElement>('[name="url"]')!
    link.value = "https://example.com/marker.svg"
    link.dispatchEvent(new Event("input", {bubbles: true}))
    await editor.updateComplete
    expect((dialog.querySelector('.marker-image-filename') as HTMLElement).hidden).toBe(true)
  })

  it("embeds an uploaded marker as a data URL and keeps native dialog changes out of ribbon commits", async () => {
    const {editor, changes} = await mount()
    const commits = vi.fn()
    editor.addEventListener("ribbon-input-commit", commits)
    const dialog = await openDialog(editor)
    const file = dialog.querySelector<HTMLInputElement>('[name="file"]')!
    Object.defineProperty(file, "files", {value: [new File([svg], "marker.svg", {type: "image/svg+xml"})]})
    file.dispatchEvent(new Event("change", {bubbles: true}))
    expect(commits).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>(".marker-image-preview img")!.getAttribute("src")).toBe(dataURL))
    expect(dialog.open).toBe(true)
    expect(changes).not.toHaveBeenCalled()
    expect((dialog.querySelector(".marker-image-preview") as HTMLElement).hidden).toBe(false)
    submit(dialog)
    await vi.waitFor(() => expect(changes).toHaveBeenCalledOnce())
    expect(changes.mock.calls[0][0].detail).toEqual({styles: {
      "list-style-image": {value: "var(--ww-list-marker-image)", priority: ""},
      "--ww-list-marker-image": {value: `url("${dataURL}")`, priority: ""},
    }})
    expect(dialog.open).toBe(false)
    expect(document.body.querySelector("dialog")).toBeNull()
  })

  it("downloads a linked marker and embeds its bytes instead of the original URL", async () => {
    const fetchImage = vi.fn().mockResolvedValue({ok: true, blob: async () => new Blob([svg], {type: "image/svg+xml"})})
    vi.stubGlobal("fetch", fetchImage)
    const {editor, changes} = await mount({"list-style-image": {value: "none", priority: "important"}})
    const dialog = await openDialog(editor)
    enterURL(dialog, "https://example.com/marker.svg")
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>(".marker-image-preview img")!.getAttribute("src")).toBe(dataURL))
    expect(changes).not.toHaveBeenCalled()
    expect(dialog.open).toBe(true)
    submit(dialog)
    await vi.waitFor(() => expect(changes).toHaveBeenCalledOnce())
    expect(fetchImage).toHaveBeenCalledOnce()
    expect(fetchImage).toHaveBeenCalledWith("https://example.com/marker.svg", {signal: expect.any(AbortSignal), credentials: "omit"})
    expect(changes.mock.calls[0][0].detail).toEqual({styles: {
      "list-style-image": {value: "var(--ww-list-marker-image)", priority: "important"},
      "--ww-list-marker-image": {value: `url("${dataURL}")`, priority: ""},
    }})
    expect(dialog.open).toBe(false)
  })

  it("invalidates the preview when the link changes and only applies the new preview", async () => {
    const replacement = svg.replace('r="4"', 'r="2"')
    const fetchImage = vi.fn().mockResolvedValueOnce({ok: true, blob: async () => new Blob([svg], {type: "image/svg+xml"})})
      .mockResolvedValueOnce({ok: true, blob: async () => new Blob([replacement], {type: "image/svg+xml"})})
    vi.stubGlobal("fetch", fetchImage)
    const {editor, changes} = await mount()
    const dialog = await openDialog(editor)
    const link = dialog.querySelector<HTMLInputElement>('[name="url"]')!
    link.value = "https://example.com/first.svg"
    link.dispatchEvent(new Event("input", {bubbles: true}))
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(dataURL))
    link.value = "https://example.com/second.svg"
    link.dispatchEvent(new Event("input", {bubbles: true}))
    await editor.updateComplete
    expect((dialog.querySelector(".marker-image-preview") as HTMLElement).hidden).toBe(true)
    const nextDataURL = `data:image/svg+xml;base64,${btoa(replacement)}`
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(nextDataURL))
    expect(changes).not.toHaveBeenCalled()
    submit(dialog)
    expect(changes.mock.calls[0][0].detail.styles["--ww-list-marker-image"].value).toBe(`url("${nextDataURL}")`)
  })

  it("discards a ready preview on cancellation without applying it", async () => {
    const {editor, changes} = await mount()
    const dialog = await openDialog(editor)
    const picker = dialog.querySelector<HTMLInputElement>('[name="file"]')!
    Object.defineProperty(picker, "files", {value: [new File([svg], "marker.svg", {type: "image/svg+xml"})]})
    picker.dispatchEvent(new Event("change", {bubbles: true}))
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(dataURL))
    dialog.close()
    await vi.waitFor(() => expect(dialog.querySelector<HTMLImageElement>("img")!.hasAttribute("src")).toBe(false))
    expect(changes).not.toHaveBeenCalled()
  })

  it("reports failed links and non-image uploads without changing the document", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: false, status: 404}))
    const {editor, changes} = await mount()
    const dialog = await openDialog(editor)
    enterURL(dialog, "https://example.com/missing.png")
    await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')!.textContent).toContain("404"))
    expect(dialog.open).toBe(true)
    const file = dialog.querySelector<HTMLInputElement>('[name="file"]')!
    Object.defineProperty(file, "files", {value: [new File(["text"], "marker.txt", {type: "text/plain"})]})
    file.dispatchEvent(new Event("change", {bubbles: true}))
    await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')!.textContent).toContain("Choose an image"))
    expect(changes).not.toHaveBeenCalled()
  })

  it.each(["cancel", "disconnect", "selection", "same-type selection"])("ignores a linked image that finishes after %s", async ending => {
    let finish!: (response: unknown) => void
    const fetchImage = vi.fn(() => new Promise(resolve => {finish = resolve}))
    vi.stubGlobal("fetch", fetchImage)
    const {editor, changes} = await mount()
    const dialog = await openDialog(editor)
    enterURL(dialog, "https://example.com/slow.svg")
    await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledOnce())
    const signal = (fetchImage.mock.calls[0] as unknown as [string, {signal: AbortSignal}])[1].signal
    if(ending === "cancel") dialog.close()
    else if(ending === "disconnect") editor.remove()
    else {
      editor.state = {...editor.state, target: {...editor.state.target!, localName: ending === "selection" ? "ol" : "ul"},
        inline: ending === "same-type selection" ? {color: {value: "red", priority: ""}} : editor.state.inline}
      if(ending === "same-type selection") editor.selectionKey = "another-list"
      await editor.updateComplete
    }
    await vi.waitFor(() => expect(signal.aborted).toBe(true))
    finish({ok: true, blob: async () => new Blob([svg], {type: "image/svg+xml"})})
    await Promise.resolve()
    await Promise.resolve()
    expect(changes).not.toHaveBeenCalled()
  })

  it("replaces an image with a native marker and clears both marker styles together", async () => {
    const {editor, root, changes} = await mount({
      "list-style-type": {value: "disc", priority: "important"},
      "list-style-image": {value: `url("${dataURL}")`, priority: "important"},
    })
    expect(root.querySelector('.marker-image-option')!.getAttribute("aria-pressed")).toBe("true")
    expect(root.querySelector('button[aria-label="Disc"]')!.getAttribute("aria-pressed")).toBe("false")
    root.querySelector<HTMLButtonElement>('button[aria-label="Circle"]')!.click()
    expect(changes.mock.calls[0][0].detail).toEqual({styles: {
      "list-style-type": {value: "circle", priority: "important"},
      "list-style-image": {value: "none", priority: "important"},
      "--ww-list-marker-image": null,
    }})
    root.querySelector<HTMLButtonElement>('[aria-label="Clear Marker"]')!.click()
    expect(changes.mock.calls[1][0].detail).toEqual({styles: {"list-style-type": null, "list-style-image": null, "--ww-list-marker-image": null}})
    expect(editor.state.inline["list-style-image"].value).toContain(dataURL)
  })
})
