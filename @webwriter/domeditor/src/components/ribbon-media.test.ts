// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

beforeEach(() => document.body.replaceChildren())

describe("media ribbon drawer", () => {
  it("dispatches the Image insertion command from an Insert media button", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const image = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Media"] ribbon-button[label="Image"]',
    )!
    await image.updateComplete

    image.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "Image", keepDrawerOpen: false},
    }))
  })

  it("gives every requested media command an advanced dropdown", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    document.body.append(ribbon)
    await ribbon.updateComplete

    for(const label of ["Image", "Audio", "Video", "Website"]) {
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
        `ribbon-drawer[label="Media"] ribbon-button[label="${label}"]`,
      )!
      await button.updateComplete
      expect(button.shadowRoot!.querySelector("ribbon-menu[custom-content]")).not.toBeNull()
      expect(button.shadowRoot!.querySelector('.submenu-trigger[aria-haspopup="dialog"]')).not.toBeNull()
    }
  })

  it("reflects selected attributes and offers the picture/img switch", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    ribbon.media = {type: "picture", attributes: {alt: "A diagram", loading: "lazy"}}
    document.body.append(ribbon)
    await ribbon.updateComplete
    const image = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Media"] ribbon-button[label="Image"]',
    )!
    await image.updateComplete

    expect(image.active).toBe(true)
    expect(image.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="picture: Alternative text"]')?.value).toBe("A diagram")
    expect(image.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="picture: Loading"]')?.value).toBe("lazy")
    expect(image.shadowRoot!.querySelector<HTMLButtonElement>(".media-type-switch")?.textContent).toContain("<img>")
  })

  it("dispatches attribute and image-type changes from the dropdown", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    ribbon.media = {type: "img", attributes: {}}
    document.body.append(ribbon)
    await ribbon.updateComplete
    const attributeListener = vi.fn()
    const typeListener = vi.fn()
    ribbon.addEventListener("media-attribute-change", attributeListener)
    ribbon.addEventListener("media-type-change", typeListener)
    const image = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Media"] ribbon-button[label="Image"]',
    )!
    await image.updateComplete
    const alt = image.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="picture: Alternative text"]')!
    alt.value = "A photo"
    alt.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    image.shadowRoot!.querySelector<HTMLButtonElement>(".media-type-switch")!.click()

    expect(attributeListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {type: "picture", attribute: "alt", value: "A photo"},
    }))
    expect(typeListener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "picture"}}))
  })

  it("switches Website details and renders attributes for the selected element", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    ribbon.media = {type: "embed", attributes: {src: "https://example.test", type: "text/html"}}
    document.body.append(ribbon)
    await ribbon.updateComplete
    const typeListener = vi.fn()
    ribbon.addEventListener("media-type-change", typeListener)
    ribbon.addEventListener("media-type-change", event => {
      const type = (event as CustomEvent<{type: "iframe" | "embed" | "object"}>).detail.type
      ribbon.media = {type, attributes: {}}
    })
    const website = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Media"] ribbon-button[label="Website"]',
    )!
    await website.updateComplete

    const element = website.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Website: Element"]')!
    const trigger = website.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const menu = website.shadowRoot!.querySelector<HTMLElement>("ribbon-menu[custom-content]")!
    expect(website.active).toBe(true)
    expect(element.value).toBe("embed")
    expect(element.hasAttribute("data-ribbon-input-persistent")).toBe(true)
    expect(website.shadowRoot!.querySelector('input[aria-label="Website: MIME type"]')).not.toBeNull()
    expect(website.shadowRoot!.querySelector('input[aria-label="Website: Sandbox"]')).toBeNull()

    trigger.click()
    await website.updateComplete
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(menu.hasAttribute("hidden")).toBe(false)

    const commitListener = vi.fn()
    ribbon.addEventListener("ribbon-input-commit", commitListener)
    element.value = "object"
    element.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(typeListener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "object"}}))
    expect(commitListener).not.toHaveBeenCalled()
    await ribbon.updateComplete
    await website.updateComplete
    expect(website.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")?.getAttribute("aria-expanded")).toBe("true")
    expect(website.shadowRoot!.querySelector<HTMLElement>("ribbon-menu[custom-content]")?.hasAttribute("hidden")).toBe(false)
    expect(website.shadowRoot!.querySelector('input[aria-label="Website: Data URL"]')).not.toBeNull()
    expect(website.shadowRoot!.querySelector('input[aria-label="Website: MIME type"]')).not.toBeNull()
    expect(website.shadowRoot!.querySelector('input[aria-label="Website: Sandbox"]')).toBeNull()
  })
})
