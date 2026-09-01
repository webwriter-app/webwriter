// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import {DomEditorToolbox} from "./toolbox"

beforeEach(() => document.body.replaceChildren())

describe("media ribbon drawer", () => {
  it("dispatches the Image insertion command from a Start media button", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const image = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Image"]',
    )!
    await image.updateComplete

    image.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "Image", keepDrawerOpen: false},
    }))
  })

  it("keeps media insertion buttons free of option dropdowns", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    for(const label of ["Image", "Audio", "Video", "Website"]) {
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
        `ribbon-drawer[label="Elements"] ribbon-button[label="${label}"]`,
      )!
      await button.updateComplete
      expect(button.shadowRoot!.querySelector("ribbon-menu[custom-content]")).toBeNull()
      expect(button.shadowRoot!.querySelector(".submenu-trigger")).toBeNull()
    }
  })

  it.each([
    ["picture", "Image"],
    ["audio", "Audio"],
    ["video", "Video"],
    ["iframe", "Website"],
  ] as const)("renders the selected %s options in a dedicated %s toolbox", async (type, label) => {
    const toolbox = new DomEditorToolbox()
    toolbox.media = {type, attributes: {}}
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete

    expect(getComputedStyle(toolbox).width).toBe("200px")
    expect(toolbox.shadowRoot!.querySelector('[data-tool="Edit"] .toolbox-tab-label')?.textContent).toBe(label)
    expect(toolbox.shadowRoot!.querySelector(`ribbon-drawer[label="${label}"]`)).not.toBeNull()
    const controls = toolbox.shadowRoot!.querySelector<HTMLElement>(".media-toolbox-controls")!
    expect(getComputedStyle(controls).flexDirection).toBe("column")
    expect(Array.from(controls.querySelectorAll("input, select"))
      .every(control => control.getAttribute("type") === "checkbox" || getComputedStyle(control).width === "100%"))
      .toBe(true)
    expect(toolbox.shadowRoot!.querySelector("ribbon-menu[custom-content]")).toBeNull()
  })

  it("reflects image attributes and dispatches edits directly from its toolbox", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {alt: "A diagram", loading: "lazy"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const attributeListener = vi.fn()
    const typeListener = vi.fn()
    toolbox.addEventListener("media-attribute-change", attributeListener)
    toolbox.addEventListener("media-type-change", typeListener)
    const alt = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Alternative text"]')!
    expect(alt.value).toBe("A diagram")
    expect(toolbox.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Image: Loading"]')?.value).toBe("lazy")
    alt.value = "A photo"
    alt.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".media-type-switch")!.click()

    expect(attributeListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {type: "img", attribute: "alt", value: "A photo"},
    }))
    expect(typeListener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "picture"}}))
  })

  it("offers figure conversion and caption actions from the media toolbox", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {src: "diagram.png"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const actions = vi.fn()
    toolbox.addEventListener("ribbon-button-click", actions)

    const convert = toolbox.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Convert to figure"]')!
    expect(convert).not.toBeNull()
    await convert.updateComplete
    convert.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(actions).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({label: "media-to-figure"})}))

    toolbox.figure = {hasCaption: false}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Convert to figure"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Add caption above"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Add caption below"]')).not.toBeNull()

    toolbox.figure = {hasCaption: true}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Edit caption"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label^="Add caption"]')).toBeNull()
  })

  it("renders timed-media resources and dispatches guarded row and fallback edits", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {
      type: "video",
      attributes: {controls: ""},
      sources: [
        {index: 0, attributes: {src: "movie.mp4", type: "video/mp4"}},
        {index: 1, attributes: {src: "movie.webm", type: "video/webm"}},
      ],
      tracks: [{index: 2, attributes: {kind: "captions", src: "captions.vtt", srclang: "en"}}],
      fallbackHTML: "<p>Download the movie.</p>",
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const listener = vi.fn()
    toolbox.addEventListener("media-resource-action", listener)

    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="source"]')).toHaveLength(2)
    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="track"]')).toHaveLength(1)
    const source = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Source: Source URL"]')!
    expect(source.value).toBe("movie.mp4")
    source.value = "movie-hd.mp4"
    source.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video",
      action: "set-attribute",
      resource: "source",
      index: 0,
      expected: {src: "movie.mp4", type: "video/mp4"},
      attribute: "src",
      value: "movie-hd.mp4",
    }}))

    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Move source 1 down"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      action: "move", resource: "source", index: 0, direction: 1,
    })}))
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove track 1"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      action: "remove", resource: "track", index: 2,
    })}))

    const fallback = toolbox.shadowRoot!.querySelector<HTMLTextAreaElement>('.media-fallback-input')!
    expect(fallback.value).toBe("<p>Download the movie.</p>")
    fallback.value = "<p>Use the download link.</p>"
    fallback.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video",
      action: "set-fallback",
      html: "<p>Use the download link.</p>",
      expectedHTML: "<p>Download the movie.</p>",
    }}))

    const addTrack = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".media-resource-add"))
      .find(button => button.textContent === "Add track")!
    addTrack.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video", action: "add", resource: "track",
    }}))
  })

  it("switches Website details and renders attributes directly in the toolbox", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "embed", attributes: {src: "https://example.test", type: "text/html"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const typeListener = vi.fn()
    toolbox.addEventListener("media-type-change", typeListener)
    toolbox.addEventListener("media-type-change", event => {
      const type = (event as CustomEvent<{type: "iframe" | "embed" | "object"}>).detail.type
      toolbox.media = {type, attributes: {}}
    })
    const element = toolbox.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Website: Element"]')!
    expect(element.value).toBe("embed")
    expect(element.hasAttribute("data-ribbon-input-persistent")).toBe(true)
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: MIME type"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Sandbox"]')).toBeNull()

    element.value = "object"
    element.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(typeListener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "object"}}))
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Data URL"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: MIME type"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Sandbox"]')).toBeNull()
  })
})
