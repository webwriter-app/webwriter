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
