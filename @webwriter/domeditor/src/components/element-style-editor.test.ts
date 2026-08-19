// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import type {ElementStyleState} from "../editor-bridge"
import {elementStyleCategories} from "../element-styles"
import {ElementStyleEditor, type ElementStyleChangeDetail} from "./element-style-editor"

const state = (inline: ElementStyleState["inline"] = {}): ElementStyleState => ({
  target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
  inline,
  computed: {
    display: "block",
    width: "120px",
    color: "rgb(0, 0, 0)",
    opacity: "1",
  },
  context: {display: "block", parentDisplay: "block"},
})

afterEach(() => document.body.replaceChildren())

async function mount(
  definitions = elementStyleCategories[0].basic,
  elementState = state(),
  mode: "basic" | "advanced" = "basic",
) {
  const editor = new ElementStyleEditor()
  editor.definitions = definitions
  editor.state = elementState
  editor.mode = mode
  document.body.append(editor)
  await editor.updateComplete
  return editor
}

describe("element style controls", () => {
  it("keeps controls visible but disabled when no style target exists", async () => {
    const editor = await mount(elementStyleCategories[0].basic, {
      target: null,
      inline: {},
      computed: {},
      context: {display: "", parentDisplay: ""},
    })

    const fieldset = editor.shadowRoot!.querySelector<HTMLFieldSetElement>("fieldset")!
    expect(fieldset.disabled).toBe(true)
    expect(editor.shadowRoot!.querySelectorAll(".property")).toHaveLength(6)
    expect(editor.shadowRoot!.textContent).not.toContain("Select document content")
  })

  it("uses select and dimension controls and commits serializable declarations", async () => {
    const editor = await mount()
    const changes: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => {
      changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail)
    })
    const display = editor.shadowRoot!.querySelector<HTMLSelectElement>('[data-property="display"] select')!
    const width = editor.shadowRoot!.querySelector<HTMLElement>('[data-property="width"]')!

    expect(display).not.toBeNull()
    expect(width.querySelector('input[type="number"]')).not.toBeNull()
    expect(width.querySelector("select")!.value).toBe("px")

    display.value = "grid"
    display.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.at(-1)).toEqual({
      property: "display",
      mutation: {value: "grid", priority: ""},
    })
  })

  it("presents computed values as placeholders for every control kind", async () => {
    const definitions = [
      {name: "display", label: "Display", section: "Test", control: "select", values: ["block", "grid"]},
      {name: "width", label: "Width", section: "Test", control: "length", units: ["px", "%"]},
      {name: "color", label: "Color", section: "Test", control: "color"},
      {name: "opacity", label: "Opacity", section: "Test", control: "range", min: 0, max: 1, step: 0.01},
      {name: "mix-blend-mode", label: "Blend", section: "Test", control: "toggle", values: ["normal", "multiply"]},
      {name: "z-index", label: "Order", section: "Test", control: "number"},
      {name: "transform", label: "Transform", section: "Test", control: "text"},
    ] as const
    const editor = await mount(definitions, {
      ...state(),
      computed: {
        display: "block",
        width: "120px",
        color: "rgb(0, 0, 0)",
        opacity: "1",
        "mix-blend-mode": "normal",
        "z-index": "4",
        transform: "none",
      },
    })
    const property = (name: string) => editor.shadowRoot!.querySelector<HTMLElement>(`[data-property="${name}"]`)!

    const display = property("display").querySelector("select")!
    expect(display.value).toBe("")
    expect(display.dataset.computed).toBe("")
    expect(display.selectedOptions[0].textContent).toBe("block")

    const width = property("width")
    expect(width.querySelector("input")!.value).toBe("")
    expect(width.querySelector("input")!.placeholder).toBe("120")
    expect(width.querySelector("select")!.value).toBe("px")
    expect(width.querySelector("select")!.dataset.computed).toBe("")

    editor.state = {
      ...editor.state,
      inline: {width: {value: "25px", priority: ""}},
      computed: {...editor.state.computed, width: "auto"},
    }
    await editor.updateComplete
    expect(property("width").querySelector("input")!.value).toBe("25")

    editor.state = {...editor.state, inline: {}}
    await editor.updateComplete
    expect(property("width").querySelector("input")!.value).toBe("")
    expect(property("width").querySelector("input")!.placeholder).toBe("auto")

    const color = property("color")
    const colorTrigger = color.querySelector<HTMLButtonElement>(".color-trigger")!
    const colorPopover = color.querySelector<HTMLElement>(".color-popover")!
    expect(colorTrigger.getAttribute("popovertarget")).toBe(colorPopover.id)
    expect(colorTrigger.getAttribute("aria-haspopup")).toBe("dialog")
    expect(colorTrigger.getAttribute("style")).toContain("anchor-name: --style-color-color")
    expect(colorPopover.getAttribute("popover")).toBe("auto")
    expect(colorPopover.getAttribute("style")).toBe("position-anchor: --style-color-color")
    expect(colorPopover.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe("#000000")
    expect(colorPopover.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("")
    expect(colorPopover.querySelector<HTMLInputElement>('input[type="text"]')!.placeholder).toBe("rgb(0, 0, 0)")

    const colorChanges: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => {
      colorChanges.push((event as CustomEvent<ElementStyleChangeDetail>).detail)
    })
    const colorText = colorPopover.querySelector<HTMLInputElement>('input[type="text"]')!
    colorText.value = "rebeccapurple"
    colorText.dispatchEvent(new Event("change", {bubbles: true}))
    expect(colorChanges.at(-1)).toEqual({
      property: "color",
      mutation: {value: "rebeccapurple", priority: ""},
    })

    const opacity = property("opacity")
    expect(opacity.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe("1")
    expect(opacity.querySelector<HTMLInputElement>('input[type="range"]')!.dataset.computed).toBe("")
    expect(opacity.querySelectorAll("input")).toHaveLength(1)

    const toggle = property("mix-blend-mode").querySelector<HTMLElement>(".toggle-control")!
    expect(toggle.dataset.computed).toBe("")
    expect(toggle.textContent?.trim()).toBe("normal")
    expect(property("z-index").querySelector("input")!.placeholder).toBe("4")
    expect(property("transform").querySelector("input")!.placeholder).toBe("none")

    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText
    expect(styles).toMatch(/select\[data-computed\],[\s\S]*?\.toggle-control\[data-computed\]\s*\{[\s\S]*?color:\s*#8794a3;/)
    expect(styles).toMatch(/input\[type="range"\]\[data-computed\],[\s\S]*?\.toggle-control\[data-computed\] input\s*\{[\s\S]*?accent-color:\s*#8794a3;/)
  })

  it("stretches dimension values while keeping units and popup color inputs content-sized on one row", () => {
    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText

    expect(styles).toMatch(/\.compound\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-flow:\s*row nowrap;[\s\S]*?width:\s*100%;/)
    expect(styles).toMatch(/\.compound select,[\s\S]*?\.color-popover input\s*\{[\s\S]*?field-sizing:\s*content;/)
    expect(styles).toMatch(/\.compound input\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/)
    expect(styles).toMatch(/\.color-popover-row\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-flow:\s*row nowrap;/)
  })

  it("hides native number-input steppers", () => {
    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText

    expect(styles).toMatch(/input\[type="number"\]\s*\{[\s\S]*?appearance:\s*textfield;/)
    expect(styles).toMatch(/::-webkit-inner-spin-button,[\s\S]*?::-webkit-outer-spin-button\s*\{[\s\S]*?appearance:\s*none;/)
  })

  it("stretches sliders and leaves checkbox controls unframed", () => {
    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText

    expect(styles).toMatch(/\.range-control\s*\{[\s\S]*?display:\s*flex;[\s\S]*?width:\s*100%;/)
    expect(styles).toMatch(/\.range-control input\[type="range"\]\s*\{[\s\S]*?width:\s*100%;/)
    expect(styles).toMatch(/\.toggle-control\s*\{[\s\S]*?border:\s*0;/)
  })

  it("adds vertical separation between collapsed style rows", () => {
    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText

    expect(styles).toMatch(/\.basic-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/)
    expect(styles).toMatch(/\.basic-grid\s*\{[\s\S]*?gap:\s*0\.25rem 0\.3rem;/)
  })

  it("exposes six distinct primary controls per Style category", () => {
    const expected = {
      position: ["display", "position", "overflow", "width", "height", "box-sizing"],
      layout: ["gap", "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content"],
      text: ["font-family", "font-size", "line-height", "font-weight", "text-align", "white-space"],
      color: ["color", "background-color", "background-image", "opacity", "mix-blend-mode", "box-shadow"],
      interaction: ["cursor", "user-select", "touch-action", "pointer-events", "resize", "appearance"],
      other: ["object-fit", "object-position", "image-rendering", "content", "will-change", "field-sizing"],
    }

    elementStyleCategories.forEach(category => {
      const primary = category.basic.map(definition => definition.name)
      const advanced = new Set(category.advanced.map(definition => definition.name))
      expect(primary).toEqual(expected[category.id])
      expect(primary.filter(name => advanced.has(name))).toEqual([])
    })
  })

  it("advances one CSS-wide keyword per label-button activation", async () => {
    const editor = await mount()
    const changes: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => {
      changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail)
    })
    const label = () => editor.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-property="display"] .property-label',
    )!

    label().click()
    expect(changes.at(-1)).toEqual({
      property: "display",
      mutation: {value: "inherit", priority: ""},
    })
    expect(label().textContent?.trim()).toBe("Display")
    expect(label().dataset.keyword).toBeUndefined()

    editor.state = state({display: {value: "inherit", priority: ""}})
    await editor.updateComplete
    expect(label().dataset.keyword).toBe("inherit")
    expect(label().textContent).not.toContain("inherit")
    expect(editor.shadowRoot!.querySelector<HTMLSelectElement>(
      '[data-property="display"] select',
    )!.value).toBe("")
    label().click()
    expect(changes.at(-1)).toEqual({
      property: "display",
      mutation: {value: "initial", priority: ""},
    })
    expect(label().tagName).toBe("BUTTON")

    for(const keyword of ["initial", "unset"] as const) {
      editor.state = state({display: {value: keyword, priority: ""}})
      await editor.updateComplete
      label().click()
    }
    expect(changes.at(-1)).toEqual({
      property: "display",
      mutation: {value: "revert", priority: ""},
    })

    editor.state = state({display: {value: "revert", priority: ""}})
    await editor.updateComplete
    label().click()
    expect(changes.at(-1)).toEqual({property: "display", mutation: null})
  })

  it("only renders a reset action for an authored declaration", async () => {
    const editor = await mount(elementStyleCategories[0].advanced, state(), "advanced")
    const property = () => editor.shadowRoot!.querySelector<HTMLElement>('[data-property="visibility"]')!

    expect(property().querySelector('[aria-label="Clear Visibility"]')).toBeNull()
    editor.state = state({visibility: {value: "hidden", priority: "important"}})
    await editor.updateComplete
    expect(property().querySelector('[aria-label="Clear Visibility"]')).not.toBeNull()
    expect(property().querySelector('[aria-label*="!important"]')).toBeNull()
  })

  it("groups advanced controls and accepts arbitrary CSS declarations", async () => {
    const category = elementStyleCategories.find(category => category.id === "other")!
    const editor = await mount(category.advanced, state({"--existing": {value: "1", priority: ""}}), "advanced")
    editor.allowCustom = true
    await editor.updateComplete
    const changes: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => {
      changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail)
    })

    const groups = Array.from(editor.shadowRoot!.querySelectorAll<HTMLElement>(".style-section"))
    expect(groups.length).toBeGreaterThan(1)
    expect(groups.every(group => group.tagName === "DIV")).toBe(true)
    expect(editor.shadowRoot!.querySelector("details")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".section-heading")).toBeNull()
    expect(editor.shadowRoot!.textContent).not.toContain("Advanced styles for")
    expect(editor.shadowRoot!.querySelector(".advanced-divider")?.textContent).toBe("Advanced options")
    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText
    expect(styles).toMatch(/\.section-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/)
    expect(styles).toMatch(/\.style-section \+ \.style-section\s*\{[\s\S]*?border-top:\s*1px solid #d8dee6;/)
    expect(styles).toMatch(/\.advanced-divider::before\s*\{[\s\S]*?height:\s*2px;/)
    expect(styles).toMatch(/\.advanced-divider\s*\{[\s\S]*?margin:\s*1rem 0\.65rem 0\.15rem 0\.15rem;[\s\S]*?color:\s*inherit;/)
    expect(styles).toMatch(/\.advanced\s*\{[\s\S]*?overflow-y:\s*scroll;[\s\S]*?scrollbar-width:\s*thin;/)
    expect(styles).not.toMatch(/scrollbar-(?:color|gutter)|::\-webkit-scrollbar/)
    expect(editor.shadowRoot!.querySelector('.custom-declaration code')?.textContent).toBe("--existing")
    const property = editor.shadowRoot!.querySelector<HTMLInputElement>('input[name="property"]')!
    const value = editor.shadowRoot!.querySelector<HTMLInputElement>('input[name="value"]')!
    property.value = "--accent"
    property.dispatchEvent(new Event("input", {bubbles: true}))
    value.value = "rebeccapurple"
    value.dispatchEvent(new Event("input", {bubbles: true}))
    editor.shadowRoot!.querySelector<HTMLFormElement>("form")!.requestSubmit()

    expect(changes.at(-1)).toEqual({
      property: "--accent",
      mutation: {value: "rebeccapurple", priority: ""},
    })
  })
})
