// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import type {ElementStyleState} from "../editor-bridge"
import {elementStyleCategories, specializedStyleDefinitions} from "../element-styles"
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

describe("media cropping", () => {
  const definitions = specializedStyleDefinitions.filter(definition => definition.name === "object-view-box")
  async function mountCrop(style: ElementStyleState) {
    const editor = await mount(definitions, style, "compact")
    editor.propertyNames = ["object-view-box"]
    await editor.updateComplete
    return editor
  }
  it.each([
    ["inset(10%)", [10, 10, 10, 10]],
    ["inset(10% 20%)", [10, 20, 10, 20]],
    ["inset(10% 20% 30%)", [10, 20, 30, 20]],
    ["inset(0 20% 30% 5.5%)", [0, 20, 30, 5.5]],
  ] as const)("edits %s as four percentage edges and preserves priority", async (value, edges) => {
    const editor = await mountCrop(state({"object-view-box": {value, priority: "important"}}))
    const inputs = Array.from(editor.shadowRoot!.querySelectorAll<HTMLInputElement>('.crop-edges input'))
    expect(inputs.map(input => input.valueAsNumber)).toEqual(edges)
    let change: ElementStyleChangeDetail | undefined
    editor.addEventListener("element-style-change", event => {change = (event as CustomEvent<ElementStyleChangeDetail>).detail})
    inputs[0].value = "12.5"
    inputs[0].dispatchEvent(new Event("change"))
    expect(change).toEqual({property: "object-view-box", mutation: {value: `inset(12.5% ${edges[1]}% ${edges[2]}% ${edges[3]}%)`, priority: "important"}})
    editor.state = state({"object-view-box": {value: "inset(5%)", priority: ""}})
    await editor.updateComplete
    expect(inputs.map(input => input.valueAsNumber)).toEqual([5, 5, 5, 5])
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear Crop"]')!.click()
    expect(change).toEqual({property: "object-view-box", mutation: null})
  })

  it.each(["", "-1", "100", "101"])("rejects an empty or invisible crop edge: %s", async value => {
    const editor = await mountCrop(state())
    let change: unknown
    editor.addEventListener("element-style-change", event => {change = (event as CustomEvent).detail})
    const input = editor.shadowRoot!.querySelector<HTMLInputElement>('.crop-edges input')!
    input.value = value
    input.dispatchEvent(new Event("change"))
    expect(change).toBeUndefined()
    expect(input.value).toBe("0")
  })

  it.each(["circle(40%)", "inset(10px)", "inset(10% round 5px)", "inherit"])("preserves other authored clipping: %s", async value => {
    const editor = await mountCrop(state({"object-view-box": {value, priority: ""}}))
    expect(editor.shadowRoot!.querySelector('.crop-edges')).toBeNull()
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input')!.value).toBe(value === "inherit" ? "" : value)
  })
})

it.each(["border-width", "border-style", "border-color", "border-top-color"])("shows Border clear for an authored %s and clears all three parts", async property => {
  const editor = await mount([], state({[property]: {value: property === "border-width" ? "2px" : property === "border-style" ? "dashed" : "#123456", priority: ""}}), "compact")
  let change: ElementStyleChangeDetail | undefined
  editor.addEventListener("element-style-change", event => {change = (event as CustomEvent<ElementStyleChangeDetail>).detail})
  const clear = editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear Border"]')!
  expect(clear.style.visibility).not.toBe("hidden")
  clear.click()
  expect(change).toEqual({styles: {"border-width": null, "border-style": null, "border-color": null}})
  editor.state = state()
  await editor.updateComplete
  expect(editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear Border"]')!.style.visibility).toBe("hidden")
})

it("distinguishes computed defaults from explicit choices of the same value", async () => {
  const definitions = elementStyleCategories.flatMap(category => [...category.basic, ...category.advanced])
  const initial = state()
  initial.computed["text-align"] = "start"
  const editor = await mount(definitions, initial, "compact")
  editor.propertyNames = ["text-align"]
  await editor.updateComplete
  const group = () => editor.shadowRoot!.querySelector<HTMLElement>(".specialized-choice-group")!
  expect(group().hasAttribute("data-default")).toBe(true)
  const left = group().querySelector<HTMLButtonElement>('button[aria-label="Left"]')!
  expect(left.getAttribute("aria-pressed")).toBe("true")
  let change: ElementStyleChangeDetail | undefined
  editor.addEventListener("element-style-change", event => {change = (event as CustomEvent<ElementStyleChangeDetail>).detail})
  left.click()
  expect(change).toEqual({property: "text-align", mutation: {value: "left", priority: ""}})
  editor.state = {...initial, inline: {"text-align": {value: "left", priority: ""}}}
  await editor.updateComplete
  expect(group().hasAttribute("data-default")).toBe(false)
  expect(group().querySelector('button[aria-label="Left"]')!.getAttribute("aria-pressed")).toBe("true")
  editor.state = initial
  await editor.updateComplete
  expect(group().hasAttribute("data-default")).toBe(true)
})

async function mount(
  definitions = elementStyleCategories[0].basic,
  elementState = state(),
  mode: "basic" | "advanced" | "compact" = "basic",
) {
  const editor = new ElementStyleEditor()
  editor.definitions = definitions
  editor.state = elementState
  editor.mode = mode
  document.body.append(editor)
  await editor.updateComplete
  return editor
}

type StyleComboTestElement = HTMLElement & {value: string, unit: string, open: boolean, updateComplete: Promise<unknown>}

const combo = (editor: ElementStyleEditor, name: string) =>
  editor.shadowRoot!.querySelector<StyleComboTestElement>(`style-combobox#compact-${name}`)!

const comboInput = (editor: ElementStyleEditor, name: string) =>
  combo(editor, name).shadowRoot!.querySelector<HTMLInputElement>("input")!

const comboOptions = (editor: ElementStyleEditor, name: string) =>
  combo(editor, name).shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]')

async function chooseComboOption(editor: ElementStyleEditor, name: string, label: string) {
  const field = combo(editor, name)
  if(!field.open) field.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
  await field.updateComplete
  Array.from(field.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    .find(option => option.querySelector(".option-code")?.textContent === label)!.click()
  await field.updateComplete
}

async function openComboOptions(editor: ElementStyleEditor, name: string) {
  const field = combo(editor, name)
  if(!field.open) field.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
  await field.updateComplete
  return field.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]')
}

function changeComboInput(editor: ElementStyleEditor, name: string, value: string) {
  const input = comboInput(editor, name)
  input.value = value
  input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
  input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
}

describe("element style controls", () => {
  it("keeps controls enabled while the body target is loading", async () => {
    const editor = await mount(elementStyleCategories[0].basic, {
      target: null,
      inline: {},
      computed: {},
      context: {display: "", parentDisplay: ""},
    })

    const fieldset = editor.shadowRoot!.querySelector<HTMLFieldSetElement>("fieldset")!
    expect(fieldset.disabled).toBe(false)
    expect(editor.shadowRoot!.querySelectorAll(".property")).toHaveLength(6)
    expect(editor.shadowRoot!.textContent).not.toContain("Select document content")
  })

  it("announces style-target hover while the options are hovered", async () => {
    const editor = await mount()
    const hovers: boolean[] = []
    editor.addEventListener("element-style-target-hover", event => {
      hovers.push((event as CustomEvent<{hovered: boolean}>).detail.hovered)
    })
    const fieldset = editor.shadowRoot!.querySelector("fieldset")!

    fieldset.dispatchEvent(new MouseEvent("mouseenter"))
    fieldset.dispatchEvent(new MouseEvent("mouseleave"))

    expect(hovers).toEqual([true, false])
  })

  it("uses shared enum and dimension controls and commits serializable declarations", async () => {
    const editor = await mount()
    const changes: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => {
      changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail)
    })
    const display = editor.shadowRoot!.querySelector<HTMLElement>('[data-property="display"] style-combobox')!
    const width = editor.shadowRoot!.querySelector<HTMLElement>('[data-property="width"]')!

    expect(display).not.toBeNull()
    expect(width.querySelector('input[type="number"]')).not.toBeNull()
    expect(width.querySelector("select")!.value).toBe("px")

    display.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await (display as StyleComboTestElement).updateComplete
    Array.from(display.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find(option => option.textContent?.includes("grid"))!.click()
    expect(changes.at(-1)).toEqual({
      property: "display",
      mutation: {value: "grid", priority: ""},
    })
  })

  it("selects an authored length unit on first render and preserves its number when changing units", async () => {
    const editor = await mount(elementStyleCategories[0].basic.slice(3, 4), state({
      width: {value: "1rem", priority: ""},
    }))
    const width = editor.shadowRoot!.querySelector<HTMLElement>('[data-property="width"]')!
    const input = width.querySelector<HTMLInputElement>('input[type="number"]')!
    const unit = width.querySelector<HTMLSelectElement>("select")!
    const changes: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => {
      changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail)
    })

    expect(input.value).toBe("1")
    expect(unit.value).toBe("rem")
    unit.value = "px"
    unit.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.at(-1)).toEqual({
      property: "width",
      mutation: {value: "1px", priority: ""},
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

    const display = property("display").querySelector<StyleComboTestElement>("style-combobox")!
    expect(display.value).toBe("")
    display.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await display.updateComplete
    expect(display.shadowRoot!.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain("block")

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
    expect(styles).toMatch(/\.compound select\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?min-width:\s*1\.8rem;[\s\S]*?padding-inline:\s*0\.15rem;/)
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

  it("reflows vertical drawers into readable two-column rows without nested scrolling", async () => {
    const editor = await mount(elementStyleCategories[0].basic, state(), "basic")
    editor.orientation = "vertical"
    await editor.updateComplete

    const grid = editor.shadowRoot!.querySelector<HTMLElement>(".basic-grid")!
    expect(getComputedStyle(grid).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(grid).gridTemplateRows).toBe("repeat(3, minmax(2.6rem, auto))")
    const styles = (ElementStyleEditor.styles as unknown as {cssText: string}).cssText
    expect(styles).toMatch(/:host\(\[orientation="vertical"\]\[mode="basic"\]\),[\s\S]*?height:\s*auto;/)

    editor.mode = "advanced"
    editor.definitions = elementStyleCategories[0].advanced
    await editor.updateComplete
    const advanced = editor.shadowRoot!.querySelector<HTMLElement>(".advanced")!
    const controls = editor.shadowRoot!.querySelector<HTMLElement>(".section-controls")!
    expect(getComputedStyle(editor).display).toBe("block")
    expect(getComputedStyle(advanced).overflow).toBe("visible")
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
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
    expect(editor.shadowRoot!.querySelector<StyleComboTestElement>(
      '[data-property="display"] style-combobox',
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
    expect(editor.shadowRoot!.querySelector(".advanced-divider")?.textContent).toBe("Options")
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


describe("compact universal style controls", () => {
  it("keeps box properties on one row with grouped border controls", async () => {
    const editor = await mount([], state(), "compact")
    const root = editor.shadowRoot!
    expect(Array.from(root.querySelectorAll("[data-property]"), row => row.getAttribute("data-property")))
      .toEqual(["width", "height", "margin", "border-width", "padding", "background-color"])
    expect(root.querySelector(".compact-advanced")).toBeNull()
    expect(root.querySelector('[data-property="border-width"]')!.firstElementChild!.classList.contains("field-label")).toBe(true)
    expect(root.querySelector('[aria-label="Border color"]')).not.toBeNull()
    expect(root.querySelectorAll(".border-options button")).toHaveLength(8)
  })

  it("applies presets, pixels, transforms, and clearing through the shared style event", async () => {
    const editor = await mount([], state({padding: {value: "8px", priority: "important"}}), "compact")
    const changes: ElementStyleChangeDetail[] = []
    editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
    const change = (name: string, value: string) => {
      changeComboInput(editor, name, value)
    }
    expect(combo(editor, "padding").value).toBe("8")
    await chooseComboOption(editor, "padding", "Large")
    expect(changes.at(-1)).toEqual({property: "padding", mutation: {value: "16px", priority: "important"}})
    change("width", "125")
    expect(changes.at(-1)).toEqual({property: "width", mutation: {value: "125px", priority: ""}})
    change("padding", "")
    expect(changes.at(-1)).toEqual({property: "padding", mutation: null})
    editor.propertyNames = ["rotate", "scale"]
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelectorAll('style-combobox[id^="compact-"]')).toHaveLength(2)
    expect(combo(editor, "rotate").unit).toBe("deg")
    change("rotate", "45")
    expect(changes.at(-1)).toEqual({property: "rotate", mutation: {value: "45deg", priority: ""}})
    change("scale", "150")
    expect(changes.at(-1)).toEqual({property: "scale", mutation: {value: "1.5", priority: ""}})
    editor.propertyNames = null
    await editor.updateComplete
    await chooseComboOption(editor, "border-width", "Tiny")
    expect(changes.at(-1)?.property).toBe("border-width")
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="dashed"]')!.click()
    expect(changes.at(-1)).toEqual({property: "border-style", mutation: {value: "dashed", priority: ""}})
  })
})


describe("compact preset menus", () => {
  it("keeps all options while typing and closes on outside interaction or Escape", async () => {
    const editor = await mount([], state(), "compact")
    const field = combo(editor, "width")
    const toggle = field.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
    const input = comboInput(editor, "width")
    toggle.click()
    await field.updateComplete
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(toggle.querySelector("svg")).not.toBeNull()
    expect(field.open).toBe(true)
    input.value = "123"
    input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    await field.updateComplete
    expect(field.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(5)
    expect(input.getAttribute("list")).toBeNull()
    expect(field.shadowRoot!.querySelector(".unit")?.textContent).toBe("px")
    input.dispatchEvent(new Event("pointerdown", {bubbles: true, composed: true}))
    await field.updateComplete
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
    await field.updateComplete
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    toggle.click()
    await field.updateComplete
    editor.dismissMenus()
    await field.updateComplete
    document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
    await field.updateComplete
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    toggle.click()
    await editor.updateComplete
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    await editor.updateComplete
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })
})


it.each(["0.625", "62.5%"])("displays opacity %s in a slider and preserves priority", async value => {
  const editor = await mount([], state({opacity: {value, priority: "important"}}), "compact")
  editor.propertyNames = ["opacity"]
  await editor.updateComplete
  const input = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="range"]')!
  expect(input.value).toBe("0.625")
  expect([input.min, input.max, input.step]).toEqual(["0", "1", "0.01"])
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  for(const value of ["0", "1", "0.25"]) {
    input.value = value
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.at(-1)).toEqual({property: "opacity", mutation: {value, priority: "important"}})
  }
  editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Clear Opacity"]')!.click()
  expect(changes.at(-1)).toEqual({property: "opacity", mutation: null})
  editor.state = state()
  await editor.updateComplete
  expect(input.value).toBe("1")
})

it("displays authored scale as a percentage and preserves priority when editing or clearing", async () => {
  const editor = await mount([], state({scale: {value: "1.1", priority: "important"}}), "compact")
  editor.propertyNames = ["scale"]
  await editor.updateComplete
  const input = comboInput(editor, "scale")
  expect(input.value).toBe("110")
  expect(combo(editor, "scale").unit).toBe("%")
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  input.value = "62.5"
  input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
  input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  expect(changes.at(-1)).toEqual({property: "scale", mutation: {value: "0.625", priority: "important"}})
  input.value = ""
  input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
  input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  expect(changes.at(-1)).toEqual({property: "scale", mutation: null})
})


it("shows only inline values, follows selection state, and keeps preset amounts", async () => {
  const current = state()
  current.computed = {...current.computed, margin: "8px", rotate: "none", scale: "none"}
  const editor = await mount([], current, "compact")
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  const input = (name: string) => comboInput(editor, name)
  expect(combo(editor, "width").value).toBe("")
  expect(combo(editor, "margin").value).toBe("")
  expect(input("width").placeholder).toBe("Default")
    expect(Array.from(await openComboOptions(editor, "width"), option => option.querySelector(".option-value")?.textContent)).toEqual(["50px", "100px", "200px", "400px", "800px"])
    expect(Array.from(await openComboOptions(editor, "margin")).some(option => option.getAttribute("aria-selected") === "true")).toBe(false)
  editor.state = {...current, inline: {width: {value: "240px", priority: ""}}}
  await editor.updateComplete
  expect(combo(editor, "width").value).toBe("240")
  input("width").value = ""
  input("width").dispatchEvent(new Event("change"))
  expect(changes.pop()).toEqual({property: "width", mutation: null})
  editor.state = current
  await editor.updateComplete
  expect(combo(editor, "width").value).toBe("")
  editor.propertyNames = ["rotate", "scale"]
  await editor.updateComplete
  expect(combo(editor, "rotate").value).toBe("")
  expect(combo(editor, "scale").value).toBe("")
  expect(changes).toEqual([])
})


it("applies Tiny and Huge presets to box properties", async () => {
  const editor = await mount([], state(), "compact")
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  for(const [property, tiny, huge] of [["width", "50px", "800px"], ["margin", "2px", "32px"], ["border-width", "0.5px", "8px"]]) {
    const options = await openComboOptions(editor, property)
    expect(options[0].querySelector(".option-code")?.textContent).toBe("Tiny")
    expect(options[0].querySelector(".option-value")?.textContent?.trim()).toBe(tiny)
    expect(options[4].querySelector(".option-code")?.textContent).toBe("Huge")
    expect(options[4].querySelector(".option-value")?.textContent?.trim()).toBe(huge)
    options[0].click()
    expect(changes.at(-1)).toEqual({property, mutation: {value: tiny, priority: ""}})
    options[4].click()
    expect(changes.at(-1)).toEqual({property, mutation: {value: huge, priority: ""}})
  }
})

it("offers fixed border colors, Automatic, and the custom picker", async () => {
  const editor = await mount([], state(), "compact")
  const root = editor.shadowRoot!
  const picker = root.querySelector<HTMLDetailsElement>(".border-color-picker")!
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  expect(picker.querySelectorAll(".color-swatch")).toHaveLength(70)
  expect(picker.querySelector("h1, h2, h3")).toBeNull()
  picker.open = true
  picker.querySelector<HTMLButtonElement>('[aria-label="Color #5b9bd5"]')!.click()
  expect(changes.at(-1)).toEqual({property: "border-color", mutation: {value: "#5b9bd5", priority: ""}})
  expect(picker.open).toBe(false)
  picker.querySelector<HTMLButtonElement>(".palette-automatic")!.click()
  expect(changes.at(-1)).toEqual({property: "border-color", mutation: {value: "currentColor", priority: ""}})
  const custom = picker.querySelector<HTMLInputElement>('input[type="color"]')!
  let opened = 0
  Object.defineProperty(custom, "showPicker", {value: () => opened++})
  picker.open = true
  expect(custom.hidden).toBe(false)
  expect(custom.parentElement!.classList.contains("palette-custom")).toBe(true)
  const customButton = picker.querySelector<HTMLButtonElement>(".palette-custom button")!
  Object.defineProperty(picker.querySelector(".border-color-palette"), "getBoundingClientRect", {value: () => new DOMRect(20, 30, 160, 100)})
  Object.defineProperty(customButton, "getBoundingClientRect", {value: () => new DOMRect(24, 100, 152, 26)})
  customButton.click()
  expect(custom.style.left).toBe("184px")
  expect(custom.style.top).toBe("99px")
  expect(picker.open).toBe(true)
  expect(opened).toBe(1)
  custom.value = "#123456"
  custom.dispatchEvent(new Event("change"))
  expect(changes.at(-1)).toEqual({property: "border-color", mutation: {value: "#123456", priority: ""}})
  picker.open = true
  document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
  expect(picker.open).toBe(false)
  picker.open = true
  picker.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
  expect(picker.open).toBe(false)
})


it("exposes open menus for drawer stacking even without focus", async () => {
  const editor = await mount([], state(), "compact")
  const picker = editor.shadowRoot!.querySelector<HTMLDetailsElement>(".border-color-picker")!
  picker.open = true
  picker.dispatchEvent(new Event("toggle"))
  expect(editor.hasAttribute("popup-open")).toBe(true)
  expect(editor.matches(":focus-within")).toBe(false)
  picker.open = false
  picker.dispatchEvent(new Event("toggle"))
  expect(editor.hasAttribute("popup-open")).toBe(false)
  combo(editor, "width").open = true
  await combo(editor, "width").updateComplete
  expect(editor.hasAttribute("popup-open")).toBe(true)
  document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
  await editor.updateComplete
  expect(editor.hasAttribute("popup-open")).toBe(false)
})


it("offers background on every element and only background on the document root", async () => {
  const current = state()
  const editor = await mount([], current, "compact")
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  const background = editor.shadowRoot!.querySelector('[data-property="background-color"]')!
  background.querySelector<HTMLButtonElement>('[aria-label="Color #5b9bd5"]')!.click()
  expect(changes.at(-1)).toEqual({property: "background-color", mutation: {value: "#5b9bd5", priority: ""}})
  background.querySelector<HTMLButtonElement>(".palette-automatic")!.click()
  expect(changes.at(-1)).toEqual({property: "background-color", mutation: null})
  editor.state = {...current, target: {localName: "my-document", namespaceURI: "http://www.w3.org/1999/xhtml", documentRoot: true}}
  await editor.updateComplete
  expect(Array.from(editor.shadowRoot!.querySelectorAll("[data-property]"), row => row.getAttribute("data-property"))).toEqual(["background-color"])
  editor.propertyNames = ["rotate", "scale"]
  await editor.updateComplete
  expect(editor.shadowRoot!.querySelector("input")).toBeNull()
})

it("does not steal focus when choosing presets or colors with the pointer", async () => {
  const editor = await mount([], state(), "compact")
  const outside = document.createElement("button")
  document.body.append(outside)
  outside.focus()
  const width = combo(editor, "width")
  await chooseComboOption(editor, "width", "Tiny")
  expect(document.activeElement).toBe(outside)
  editor.shadowRoot!.querySelector<HTMLButtonElement>('.border-color-palette [aria-label="Color #5b9bd5"]')!.click()
  expect(document.activeElement).toBe(outside)
})

it("forwards native changes and Escape through the ribbon input lifecycle", async () => {
  const editor = await mount([], state(), "compact")
  const events: string[] = []
  const listener = (event: Event) => events.push(event.type)
  document.body.addEventListener("ribbon-input-commit", listener)
  document.body.addEventListener("ribbon-input-cancel", listener)
  const field = combo(editor, "width")
  const input = comboInput(editor, "width")
  input.value = "150"
  input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
  input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true}))
  await field.updateComplete
  expect(events).toEqual(["ribbon-input-commit", "ribbon-input-cancel"])
  document.body.removeEventListener("ribbon-input-commit", listener)
  document.body.removeEventListener("ribbon-input-cancel", listener)
})


it("blurs compact inputs on outside clicks even when the toolbox prevents pointer focus", async () => {
  const editor = await mount([], state(), "compact")
  const field = combo(editor, "width")
  const input = comboInput(editor, "width")
  const button = document.createElement("button")
  button.addEventListener("pointerdown", event => event.preventDefault())
  document.body.append(button)
  input.focus()
  input.dispatchEvent(new Event("pointerdown", {bubbles: true, composed: true, cancelable: true}))
  expect(editor.shadowRoot!.activeElement).toBe(field)
  button.dispatchEvent(new Event("pointerdown", {bubbles: true, composed: true, cancelable: true}))
  expect(editor.shadowRoot!.activeElement).not.toBe(field)
  input.focus()
  field.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
    .dispatchEvent(new Event("pointerdown", {bubbles: true, composed: true, cancelable: true}))
  expect(editor.shadowRoot!.activeElement).toBe(field)
})


it("opens presets on input focus, closes on blur, and blurs on Enter", async () => {
  const editor = await mount([], state(), "compact")
  const field = combo(editor, "width")
  const input = comboInput(editor, "width")
  input.focus()
  await field.updateComplete
  expect(field.open).toBe(true)
  input.blur()
  await field.updateComplete
  expect(field.open).toBe(false)
  input.focus()
  await field.updateComplete
  input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))
  await field.updateComplete
  expect(editor.shadowRoot!.activeElement).not.toBe(field)
  expect(field.open).toBe(false)
  input.focus()
  await field.updateComplete
  const option = field.shadowRoot!.querySelector<HTMLButtonElement>('[role="option"]')!
  option.dispatchEvent(new Event("pointerdown", {bubbles: true, composed: true, cancelable: true}))
  await field.updateComplete
  expect(field.open).toBe(true)
  expect(field.shadowRoot!.activeElement).toBe(input)
  option.click()
  await field.updateComplete
  expect(input.value).toBe("50")
  expect(field.open).toBe(false)
})

it("offers eight palette-based box presets and applies each as one style change", async () => {
  const editor = await mount([], state(), "compact")
  editor.showPresets = true
  await editor.updateComplete
  const buttons = editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".style-gallery button")
  expect(buttons).toHaveLength(8)
  expect(Array.from(buttons, button => button.getAttribute("aria-label"))).toEqual([
    "White style preset", "Gray style preset", "Blue style preset", "Green style preset",
    "Orange style preset", "Yellow style preset", "Red style preset", "Purple style preset",
  ])
  const changes: unknown[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  buttons[2].click()
  expect(changes).toEqual([{styles: {
    "background-color": {value: "#deebf7", priority: ""},
    "border-width": {value: "1px", priority: ""},
    "border-radius": {value: "4px", priority: ""},
    "border-style": {value: "solid", priority: ""},
    "border-color": {value: "#5b9bd5", priority: ""},
    "padding": {value: "8px", priority: ""},
    "box-shadow": {value: "none", priority: ""},
    "color": {value: "#2f3742", priority: ""},
  }}])
  editor.state = {...state(), target: {localName: "body", namespaceURI: "http://www.w3.org/1999/xhtml", documentRoot: true}}
  await editor.updateComplete
  buttons[3].click()
  expect(changes.at(-1)).toEqual({styles: {"background-color": {value: "#e2efda", priority: ""}}})
})

it.each(["td", "th"])("keeps all %s presets limited to cell paint and padding", async localName => {
  const editor = await mount([], {...state(), target: {localName, namespaceURI: "http://www.w3.org/1999/xhtml"}}, "compact")
  editor.showPresets = true
  await editor.updateComplete
  const changes: {styles: Record<string, {value: string}>}[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  for(let page = 0; page < 4; page++) {
    for(const button of editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".style-gallery button")) {
      button.click()
      const styles = changes.at(-1)!.styles
      expect(Object.keys(styles).sort()).toEqual(["background-color", "border-color", "border-style", "border-width", "color", "padding"])
      expect(styles.padding.value).toBe("8px")
      expect(styles.color.value).toBe(page >= 2 ? "#ffffff" : "#2f3742")
      expect(button.title).not.toContain("corners")
    }
    if(page < 3) {
      editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Next style presets"]')!.click()
      await editor.updateComplete
    }
  }
  expect(changes).toHaveLength(32)
})


it("edits and clears corner rounding using pixels and presets", async () => {
  const editor = await mount([], state(), "compact")
  editor.propertyNames = ["border-radius"]
  await editor.updateComplete
  const field = combo(editor, "border-radius")
  const input = field.shadowRoot!.querySelector<HTMLInputElement>("input")!
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  input.value = "6"
  input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
  input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  expect(changes.at(-1)).toEqual({property: "border-radius", mutation: {value: "6px", priority: ""}})
  await chooseComboOption(editor, "border-radius", "Medium")
  expect(changes.at(-1)).toEqual({property: "border-radius", mutation: {value: "4px", priority: ""}})
  input.value = ""
  input.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
  input.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
  expect(changes.at(-1)).toEqual({property: "border-radius", mutation: null})
})

it.each([
  ["margin", "Margin", "margin-top", "7px"],
  ["padding", "Padding", "padding-left", "8px"],
  ["border-width", "Border", "border-right-width", "3px"],
  ["border-radius", "Rounding", "border-top-left-radius", "9px"],
])("opens spatial %s controls and edits only the chosen direction", async (property, label, direction, value) => {
  const editor = await mount([], state({[direction]: {value, priority: "important"}}), "compact")
  editor.propertyNames = [property]
  editor.selectionKey = "first"
  await editor.updateComplete
  const trigger = editor.shadowRoot!.querySelector<HTMLButtonElement>(".directional-label")!
  expect(trigger.textContent).toBe(label)
  expect(trigger.hasAttribute("data-set")).toBe(true)
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
  trigger.click()
  await editor.updateComplete
  await editor.updateComplete
  const dialog = editor.shadowRoot!.querySelector<HTMLDialogElement>(".directional-dialog")!
  expect(dialog.open).toBe(true)
  const parts = Array.from(dialog.querySelectorAll<HTMLElement>(".directional-part"))
  expect(parts.map(part => part.style.gridArea)).toEqual(["top", "right", "left", "bottom"])
  expect(dialog.querySelectorAll("style-combobox")).toHaveLength(16)
  expect(parts.every(part => part.querySelectorAll("style-combobox").length === 4)).toBe(true)
  const changes: unknown[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  const name = property === "border-width" ? "border-top-width" : property === "border-radius" ? "border-top-left-radius" : `${property}-top`
  await combo(editor, name).updateComplete
  const input = comboInput(editor, name)
  changeComboInput(editor, name, "12")
  expect(changes.at(-1)).toEqual({property: name, mutation: {value: "12px", priority: name === direction ? "important" : ""}})
  editor.state = {...editor.state, inline: {...editor.state.inline, [name]: {value: "12px", priority: name === direction ? "important" : ""}}}
  await editor.updateComplete
  await combo(editor, name).updateComplete
  changeComboInput(editor, name, "invalid")
  await combo(editor, name).updateComplete
  expect(changes).toHaveLength(1)
  changeComboInput(editor, name, "")
  expect(changes.at(-1)).toEqual({property: name, mutation: null})
  if(property === "border-width") {
    dialog.querySelector<HTMLButtonElement>('[aria-label="Top border: dashed"]')!.click()
    expect(changes.at(-1)).toEqual({property: "border-top-style", mutation: {value: "dashed", priority: ""}})
    dialog.querySelector<HTMLButtonElement>('[aria-label="Color #5b9bd5"]')!.click()
    expect(changes.at(-1)).toEqual({property: "border-top-color", mutation: {value: "#5b9bd5", priority: ""}})
  }
  editor.selectionKey = "second"
  await editor.updateComplete
  expect(dialog.open).toBe(false)
  editor.state = state()
  await editor.updateComplete
  expect(trigger.hasAttribute("data-set")).toBe(false)
})

it("distinguishes directional declarations from shorthand-expanded values", async () => {
  const current = state({margin: {value: "8px", priority: ""}, "margin-top": {value: "8px", priority: ""}})
  current.authoredProperties = ["margin"]
  const editor = await mount([], current, "compact")
  editor.propertyNames = ["margin"]
  await editor.updateComplete
  const trigger = editor.shadowRoot!.querySelector<HTMLButtonElement>(".directional-label")!
  expect(trigger.hasAttribute("data-set")).toBe(false)
  trigger.click()
  await editor.updateComplete
  await editor.updateComplete
  await combo(editor, "margin-top").updateComplete
  expect(comboInput(editor, "margin-top").value).toBe("")
  editor.state = {...current, authoredProperties: ["margin", "margin-top"]}
  await editor.updateComplete
  expect(trigger.hasAttribute("data-set")).toBe(true)
  await combo(editor, "margin-top").updateComplete
  expect(comboInput(editor, "margin-top").value).toBe("8")
  editor.remove()
  expect(editor.shadowRoot!.querySelector<HTMLDialogElement>(".directional-dialog")!.open).toBe(false)
})

it("closes the directional dialog with its heading close button", async () => {
  const editor = await mount([], state(), "compact")
  editor.shadowRoot!.querySelector<HTMLButtonElement>(".directional-label")!.click()
  await editor.updateComplete
  await editor.updateComplete
  const dialog = editor.shadowRoot!.querySelector<HTMLDialogElement>(".directional-dialog")!
  expect(dialog.open).toBe(true)
  dialog.querySelector<HTMLButtonElement>('.directional-heading [aria-label="Close directional styles"]')!.click()
  expect(dialog.open).toBe(false)
  await editor.updateComplete
  expect(editor.shadowRoot!.querySelector(".directional-dialog")).toBeNull()
})

it.each([["background-color", "color"], ["color", "background-color"]])("combines %s and %s into one Color field with independent palettes", async (first, second) => {
  const editor = await mount([], state({
    color: {value: "#5b9bd5", priority: "important"},
    "background-color": {value: "#ffffff", priority: ""},
  }), "compact")
  editor.propertyNames = [first, second]
  await editor.updateComplete
  const rows = editor.shadowRoot!.querySelectorAll(".compact-row")
  expect(rows).toHaveLength(1)
  expect(rows[0].querySelector(".field-label > span")!.textContent).toBe("Color")
  const parts = Array.from(rows[0].querySelectorAll<HTMLElement>(".color-fields > [data-property]"))
  expect(parts.map(part => part.dataset.property)).toEqual(["color", "background-color"])
  expect(parts.map(part => part.querySelector("summary")!.getAttribute("aria-label"))).toEqual(["Text color", "Background color"])
  const changes: unknown[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  for(const [index, property] of ["color", "background-color"].entries()) {
    parts[index].querySelector<HTMLButtonElement>('[aria-label="Color #ed7d31"]')!.click()
    expect(changes.at(-1)).toEqual({property, mutation: {value: "#ed7d31", priority: index === 0 ? "important" : ""}})
    parts[index].querySelector<HTMLButtonElement>(".palette-automatic")!.click()
    expect(changes.at(-1)).toEqual({property, mutation: null})
  }
  const clear = rows[0].querySelector<HTMLButtonElement>('[aria-label="Clear Color"]')!
  clear.click()
  expect(changes.at(-1)).toEqual({styles: {color: null, "background-color": null}})
  editor.state = state({"background-color": {value: "red", priority: ""}})
  await editor.updateComplete
  expect(clear.style.visibility).not.toBe("hidden")
  editor.state = state()
  await editor.updateComplete
  expect(clear.style.visibility).toBe("hidden")
})

it("shows text color as an Abc preview and changes or resets it through the palette", async () => {
  const editor = await mount([], state({color: {value: "#5b9bd5", priority: "important"}}), "compact")
  editor.propertyNames = ["color"]
  await editor.updateComplete
  const preview = editor.shadowRoot!.querySelector<HTMLElement>(".text-color-preview")!
  expect(preview.textContent).toBe("Abc")
  expect(preview.style.borderColor).toBe("#5b9bd5")
  const changes: unknown[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Color #ed7d31"]')!.click()
  expect(changes.at(-1)).toEqual({property: "color", mutation: {value: "#ed7d31", priority: "important"}})
  editor.shadowRoot!.querySelector<HTMLButtonElement>(".palette-automatic")!.click()
  expect(changes.at(-1)).toEqual({property: "color", mutation: null})
})

it("paginates box presets with shadows and saturated colors", async () => {
  const editor = await mount([], state(), "compact")
  editor.showPresets = true
  await editor.updateComplete
  const changes: any[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  const next = () => editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Next style presets"]')!
  const previous = () => editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Previous style presets"]')!
  expect(previous().disabled).toBe(true)
  for(let page = 0; page < 4; page++) {
    const presets = editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".style-gallery button")
    expect(presets).toHaveLength(8)
    expect(presets[2].textContent).toBe("Abc")
    expect(presets[2].style.color).toBe(page >= 2 ? "#fff" : "#2f3742")
    presets[2].click()
    const styles = changes.at(-1).styles
    expect(styles["box-shadow"].value).toBe(page % 2 ? "0 4px 8px #0003" : "none")
    expect(styles.color.value).toBe(page >= 2 ? "#ffffff" : "#2f3742")
    expect(styles["background-color"].value).toBe(page >= 2 ? "#2e75b6" : "#deebf7")
    if(page < 3) {next().click(); await editor.updateComplete}
  }
  expect(next().disabled).toBe(true)
  previous().click()
  await editor.updateComplete
  expect(next().disabled).toBe(false)
})

it.each(["box-shadow", "filter"])("offers visual presets and custom values for %s", async property => {
  const editor = await mount([], state(), "compact")
  editor.propertyNames = [property]
  await editor.updateComplete
  const changes: any[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent).detail))
  expect(editor.shadowRoot!.querySelector<HTMLElement>(".effect-popup")!.hidden).toBe(true)
  const buttons = editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".effect-presets button")
  expect(buttons).toHaveLength(6)
  buttons[1].click()
  expect(changes.at(-1).property).toBe(property)
  const input = editor.shadowRoot!.querySelector<HTMLInputElement>(".effect-control input")!
  editor.shadowRoot!.querySelector<HTMLButtonElement>(".effect-trigger")!.click()
  await editor.updateComplete
  expect(editor.shadowRoot!.querySelector<HTMLElement>(".effect-popup")!.hidden).toBe(false)
  editor.shadowRoot!.querySelector<HTMLButtonElement>(".effect-custom")!.click()
  await editor.updateComplete
  await editor.updateComplete
  expect(editor.shadowRoot!.activeElement).toBe(input)
  expect(editor.shadowRoot!.querySelector<HTMLElement>(".effect-popup")!.hidden).toBe(true)
  input.value = property === "filter" ? "contrast(1.2)" : "2px 2px 4px black"
  input.dispatchEvent(new Event("change", {bubbles: true}))
  expect(changes.at(-1)).toEqual({property, mutation: {value: input.value, priority: ""}})
  input.value = ""
  input.dispatchEvent(new Event("change", {bubbles: true}))
  expect(changes.at(-1)).toEqual({property, mutation: null})
  input.blur()
  input.focus()
  await editor.updateComplete
  input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
  await editor.updateComplete
  expect(editor.shadowRoot!.activeElement).not.toBe(input)
  expect(editor.shadowRoot!.querySelector<HTMLElement>(".effect-popup")!.hidden).toBe(true)
})

it("groups shadow and filter preview fields and reflects their current effects", async () => {
  const editor = await mount([], state({
    "box-shadow": {value: "2px 2px 4px black", priority: ""},
    filter: {value: "sepia(1)", priority: ""},
  }), "compact")
  editor.propertyNames = ["box-shadow", "filter"]
  await editor.updateComplete
  expect(editor.shadowRoot!.querySelectorAll(".effect-fields > .effect-control")).toHaveLength(2)
  expect(editor.shadowRoot!.querySelector<HTMLElement>(".effect-trigger .shadow-preview")!.style.boxShadow).toBe("2px 2px 4px black")
  expect(editor.shadowRoot!.querySelector<HTMLElement>(".effect-trigger .filter-preview")!.style.filter).toBe("sepia(1)")
})

it.each([
  ["rotate", "Straight", "0deg"], ["scale", "Original", "1"],
])("offers named numerical %s presets and preserves priority", async (property, label, value) => {
  const editor = await mount([], state({[property]: {value: "0", priority: "important"}}), "compact")
  editor.propertyNames = [property]
  await editor.updateComplete
  const changes: ElementStyleChangeDetail[] = []
  editor.addEventListener("element-style-change", event => changes.push((event as CustomEvent<ElementStyleChangeDetail>).detail))
  const field = combo(editor, property)
  const input = comboInput(editor, property)
  expect(input.getAttribute("role")).toBe("combobox")
  await openComboOptions(editor, property)
  const option = Array.from(field.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    .find(button => button.textContent?.includes(label))!
  option.click()
  expect(changes.at(-1)).toEqual({property, mutation: {value, priority: "important"}})
})


it("limits document positioning choices while retaining canvas and slide choices", async () => {
  const definitions = elementStyleCategories[0].basic.filter(definition => definition.name === "position")
  const editor = await mount(definitions, state({position: {value: "absolute", priority: ""}}))
  const choices = () => Array.from(editor.shadowRoot!.querySelectorAll<import("./style-combobox").StyleCombobox>("style-combobox"))
    .flatMap(combo => combo.options.map(option => option.value))
  expect(choices()).not.toContain("relative")
  expect(choices()).not.toContain("absolute")
  expect(choices()).not.toContain("sticky")
  expect(choices()).toContain("static")
  expect(choices()).toContain("fixed")
  editor.state = {...editor.state, context: {...editor.state.context, positioning: true}}
  await editor.updateComplete
  expect(choices()).toEqual(expect.arrayContaining(["relative", "absolute", "sticky"]))
})
