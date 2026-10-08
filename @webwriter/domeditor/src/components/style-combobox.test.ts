// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {StyleCombobox} from "./style-combobox"

afterEach(() => document.body.replaceChildren())

async function mount(editable = true) {
  const combo = new StyleCombobox()
  combo.label = "Value"
  combo.editable = editable
  combo.options = [{value: "1", label: "Small"}, {value: "2", label: "Large"}]
  document.body.append(combo)
  await combo.updateComplete
  return combo
}

describe("shared Style combobox", () => {
  it("edits custom numerical values and retains all named presets while typing", async () => {
    const combo = await mount()
    combo.showValue = true
    combo.unit = "px"
    await combo.updateComplete
    const changes = vi.fn()
    combo.addEventListener("combobox-change", changes)
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.focus()
    input.value = "12"
    input.dispatchEvent(new InputEvent("input"))
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(2)
    expect(combo.shadowRoot!.querySelector(".unit")?.textContent).toBe("px")
    input.dispatchEvent(new Event("change"))
    expect(changes.mock.calls.at(-1)?.[0].detail).toEqual({value: "12"})
  })

  it("uses a fixed select list with keyboard selection and preserves unknown values", async () => {
    const combo = await mount(false)
    combo.value = "custom"
    await combo.updateComplete
    const changes = vi.fn()
    combo.addEventListener("combobox-change", changes)
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    expect(input.readOnly).toBe(true)
    expect(input.value).toBe("custom")
    input.focus()
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(2)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    await combo.updateComplete
    expect(changes.mock.calls[0][0].detail).toEqual({value: "1"})
    expect(input.value).toBe("Small")
    expect(combo.hasAttribute("popup-open")).toBe(false)
  })

  it("toggles multiple selections without dropping unlisted values or closing the list", async () => {
    const combo = await mount(false)
    combo.multiple = true
    combo.values = ["custom", "1"]
    await combo.updateComplete
    const changes = vi.fn()
    combo.addEventListener("combobox-change", changes)
    combo.shadowRoot!.querySelector<HTMLInputElement>("input")!.focus()
    await combo.updateComplete
    const options = combo.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]')
    options[1].click()
    await combo.updateComplete
    expect(changes.mock.calls.at(-1)?.[0].detail.values).toEqual(["custom", "1", "2"])
    expect(combo.hasAttribute("popup-open")).toBe(true)
    options[0].click()
    expect(changes.mock.calls.at(-1)?.[0].detail.values).toEqual(["custom", "2"])
  })

  it("closes and resets on Escape, and disables both input and toggle", async () => {
    const combo = await mount()
    combo.value = "1"
    combo.showValue = true
    await combo.updateComplete
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.focus()
    input.value = "12"
    input.dispatchEvent(new InputEvent("input"))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    await combo.updateComplete
    expect(input.value).toBe("1")
    expect(combo.hasAttribute("popup-open")).toBe(false)
    combo.disabled = true
    await combo.updateComplete
    expect(input.disabled).toBe(true)
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.disabled).toBe(true)
  })
})
