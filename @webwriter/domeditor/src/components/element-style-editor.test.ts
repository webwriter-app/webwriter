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
    expect(editor.shadowRoot!.querySelectorAll(".property")).toHaveLength(4)
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
    editor.state = state({visibility: {value: "hidden", priority: ""}})
    await editor.updateComplete
    expect(property().querySelector('[aria-label="Clear Visibility"]')).not.toBeNull()
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

    const groups = Array.from(editor.shadowRoot!.querySelectorAll("details"))
    expect(groups.length).toBeGreaterThan(1)
    expect(groups.every(group => group.open)).toBe(true)
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
