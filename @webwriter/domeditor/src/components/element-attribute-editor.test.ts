// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {ElementAttributeEditor} from "./element-attribute-editor"
import {deliberatelyUnsupportedElementNames, elementEditingLimitation} from "../element-attributes"

beforeEach(() => document.body.replaceChildren())

async function mount(localName = "details", attributes: Record<string, string> = {}) {
  const editor = new ElementAttributeEditor()
  editor.state = {
    path: [0],
    localName,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    name: localName === "details" ? "Details" : localName,
    attributes,
  }
  document.body.append(editor)
  await editor.updateComplete
  return editor
}

describe("element attribute editor", () => {
  it("presents friendly element-specific and common fields", async () => {
    const editor = await mount("details", {name: "faq", open: "", id: "shipping"})

    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Details: Accordion group"]')!.value)
      .toBe("faq")
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Details: Initially open"]')!.checked)
      .toBe(true)
    expect(editor.shadowRoot!.querySelector('[aria-label="Details: Accordion group"]')!.closest("details")).toBeNull()
    expect(editor.shadowRoot!.querySelector('[aria-label="Details: ID"]')!.closest("details")).not.toBeNull()
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Details: ID"]')!.value)
      .toBe("shipping")
    expect(editor.shadowRoot!.querySelector("summary")?.textContent).toContain("All attributes (3)")
  })

  it("shows disabled global attributes without a selected element", async () => {
    const editor = new ElementAttributeEditor()
    editor.disabled = true
    document.body.append(editor)
    await editor.updateComplete

    expect(Array.from(editor.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      "input, select, button",
    )).every(control => control.disabled)).toBe(true)
    expect(editor.shadowRoot!.querySelector('[aria-label="Element: ID"]')).not.toBeNull()
    expect(editor.shadowRoot!.querySelector('[aria-label="Element: Classes"]')).not.toBeNull()
    expect(editor.shadowRoot!.querySelector('[aria-label="Element: Language"]')).not.toBeNull()
  })

  it("dispatches boolean, custom, rename, value, and removal mutations", async () => {
    const editor = await mount("details", {"data-kind": "faq"})
    const listener = vi.fn()
    editor.addEventListener("element-attribute-change", listener)

    const open = editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Details: Initially open"]')!
    open.checked = true
    open.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    const value = editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Details: data-kind"]')!
    value.value = "guide"
    value.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    const rename = editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Rename data-kind"]')!
    rename.value = "data-topic"
    rename.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    editor.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove data-kind"]')!.click()

    const form = editor.shadowRoot!.querySelector<HTMLFormElement>("form.add-attribute")!
    ;(form.elements.namedItem("name") as HTMLInputElement).value = "aria-label"
    ;(form.elements.namedItem("value") as HTMLInputElement).value = "Questions"
    form.dispatchEvent(new SubmitEvent("submit", {bubbles: true, composed: true, cancelable: true}))

    expect(listener.mock.calls.map(([event]) => event.detail)).toEqual([
      expect.objectContaining({name: "open", value: ""}),
      expect.objectContaining({name: "data-kind", value: "guide"}),
      expect.objectContaining({name: "data-topic", previousName: "data-kind", value: "faq"}),
      expect.objectContaining({name: "data-kind", value: null}),
      expect.objectContaining({name: "aria-label", value: "Questions"}),
    ])
    expect(listener.mock.calls.every(([event]) => event.detail.path.join(".") === "0")).toBe(true)
  })

  it("shows active and style attributes without allowing them to be edited", async () => {
    const editor = await mount("iframe", {srcdoc: "<p>Unsafe</p>", onclick: "run()", style: "width: 10px"})

    for(const name of ["srcdoc", "onclick", "style"]) {
      expect(editor.shadowRoot!.querySelector<HTMLInputElement>(`input[aria-label="iframe: ${name}"]`)).toBeDisabled()
      expect(editor.shadowRoot!.querySelector<HTMLInputElement>(`input[aria-label="Rename ${name}"]`)).toBeDisabled()
      expect(editor.shadowRoot!.querySelector(`button[aria-label="Remove ${name}"]`)).toBeNull()
    }
    expect(editor.shadowRoot!.textContent).toContain("Blocked for safety")
    expect(editor.shadowRoot!.textContent).toContain("Use the Style tools")
  })

  it("makes every deliberately unsupported element policy explicit", () => {
    expect(deliberatelyUnsupportedElementNames).toEqual([
      "script", "style", "canvas", "template", "noscript", "slot",
    ])
    for(const localName of deliberatelyUnsupportedElementNames) {
      const limitation = elementEditingLimitation(localName)
      expect(limitation?.title).toBeTruthy()
      expect(limitation?.description).toBeTruthy()
      expect(limitation?.guidance).toBeTruthy()
    }
  })

  it("explains limited elements while retaining their safe generic attributes", async () => {
    const editor = await mount("canvas", {width: "640"})

    expect(editor.shadowRoot!.querySelector(".limitation")?.textContent).toContain("Canvas drawings are not editable")
    expect(editor.shadowRoot!.querySelector(".limitation")?.textContent).toContain("Use an SVG graphic")
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="canvas: width"]')).not.toBeDisabled()
    expect(editor.shadowRoot!.querySelector("form.add-attribute")).not.toBeNull()
  })

  it("treats active-content elements and all their attributes as read-only", async () => {
    const editor = await mount("script", {src: "behavior.js", type: "module"})

    expect(editor.shadowRoot!.querySelector(".limitation")?.textContent).toContain("Executable code is read-only")
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="script: ID"]')).toBeDisabled()
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="script: src"]')).toBeDisabled()
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Rename src"]')).toBeDisabled()
    expect(editor.shadowRoot!.querySelector("form.add-attribute")).toBeNull()
  })

  it("shows widget attributes without the component editing hint", async () => {
    const editor = await mount("course-quiz", {difficulty: "hard"})

    expect(editor.shadowRoot!.querySelector(".limitation")).toBeNull()
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="course-quiz: difficulty"]')).not.toBeDisabled()
  })

  it.each(["div", "course-quiz"])("offers grouped language choices and arbitrary strings for %s", async localName => {
    const editor = await mount(localName, {lang: "de"})
    const picker = editor.shadowRoot!.querySelector("document-head-combobox")!
    await picker.updateComplete
    const input = picker.shadowRoot!.querySelector<HTMLInputElement>('[role="combobox"]')!
    expect(input.value).toBe("German")
    const listener = vi.fn()
    editor.addEventListener("element-attribute-change", listener)

    picker.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await picker.updateComplete
    expect(Array.from(picker.shadowRoot!.querySelectorAll('[role="group"]')).map(group => group.getAttribute("aria-label")))
      .toEqual(["World languages", "European languages", "Other languages"])
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      detail: expect.objectContaining({name: "lang", value: "en"}),
    }))

    input.value = "German"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("European languages")
    expect(picker.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(2) // German and Swiss German.
    picker.shadowRoot!.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      detail: expect.objectContaining({name: "lang", value: "de"}),
    }))

    for(const value of ["x-custom", "any arbitrary string", ""]) {
      input.value = value
      input.dispatchEvent(new InputEvent("input", {bubbles: true}))
      input.dispatchEvent(new Event("change", {bubbles: true}))
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
        detail: expect.objectContaining({name: "lang", value: value || null}),
      }))
    }
  })

  it.each(["div", "course-quiz", "html"])("displays English for the default language in %s", async localName => {
    const editor = await mount(localName)
    const picker = editor.shadowRoot!.querySelector("document-head-combobox")!
    await picker.updateComplete
    const input = picker.shadowRoot!.querySelector<HTMLInputElement>("input")!
    expect(input.placeholder).toBe("English")
    expect(input.value).toBe("")

    editor.state = {...editor.state!, attributes: {lang: "en"}}
    await editor.updateComplete
    await picker.updateComplete
    expect(input.value).toBe("English")
    expect(picker.value).toBe("en")
  })

  it("disables the language combobox along with the attribute editor", async () => {
    const editor = await mount("div")
    editor.disabled = true
    await editor.updateComplete
    const picker = editor.shadowRoot!.querySelector("document-head-combobox")!
    await picker.updateComplete
    expect(picker.shadowRoot!.querySelector("input")).toBeDisabled()
    expect(picker.shadowRoot!.querySelector("button")).toBeDisabled()
    expect(picker.shadowRoot!.querySelector('[role="listbox"]')).toBeNull()
  })

  it.each(["course-quiz", "div", "section"].flatMap(localName =>
    ([{}, {id: "quiz", class: "practice", title: "Practice quiz", dir: "rtl", hidden: ""}] as Record<string, string>[])
      .map(attributes => ({localName, attributes})),
  ))(
    "keeps identity, direction, and hidden fields inside All attributes: %j",
    async ({localName, attributes}) => {
      const editor = await mount(localName, attributes)
      const root = editor.shadowRoot!
      const details = root.querySelector("details")!
      expect(details.open).toBe(false)
      for(const label of ["ID", "Classes", "Title", "Direction", "Hidden"]) {
        const field = root.querySelector(`[aria-label="${localName}: ${label}"]`)!
        expect(field.closest("details")).toBe(details)
        expect(field).not.toBeDisabled()
      }
      expect(root.querySelector(`[aria-label="${localName}: Language"]`)!.closest("details")).toBeNull()

      details.open = true
      const listener = vi.fn()
      editor.addEventListener("element-attribute-change", listener)
      const direction = details.querySelector<HTMLSelectElement>(`[aria-label="${localName}: Direction"]`)!
      direction.value = "ltr"
      direction.dispatchEvent(new Event("change", {bubbles: true}))
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        detail: expect.objectContaining({name: "dir", value: "ltr"}),
      }))
      const hidden = details.querySelector<HTMLInputElement>(`[aria-label="${localName}: Hidden"]`)!
      expect(hidden.checked).toBe(Object.hasOwn(attributes, "hidden"))
      for(const checked of [true, false]) {
        hidden.checked = checked
        hidden.dispatchEvent(new Event("change", {bubbles: true}))
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
          detail: expect.objectContaining({name: "hidden", value: checked ? "" : null}),
        }))
      }
    },
  )
})
