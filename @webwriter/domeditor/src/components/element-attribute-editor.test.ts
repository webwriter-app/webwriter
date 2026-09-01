// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {ElementAttributeEditor} from "./element-attribute-editor"

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
    expect(editor.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Details: ID"]')!.value)
      .toBe("shipping")
    expect(editor.shadowRoot!.querySelector("summary")?.textContent).toContain("All attributes (3)")
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
})
