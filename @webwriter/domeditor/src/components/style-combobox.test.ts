// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {StyleCombobox} from "./style-combobox"
import {formatShortcut} from "../app-settings"

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
  it("focuses the current value, opens suggestions, and shows the formatted shortcut in native titles", async () => {
    const combo = await mount(false)
    combo.value = "2"
    combo.shortcut = "Alt+Shift+Y"
    await combo.updateComplete
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!

    await combo.focusAndOpen()

    expect(combo.open).toBe(true)
    expect(combo.shadowRoot!.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(input.title).toBe(`Value (${formatShortcut(combo.shortcut)})`)
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.title).toBe(input.title)
    await combo.focusAndOpen()
    expect(combo.open).toBe(true)
  })

  it("does not focus or open when disabled or disconnected", async () => {
    const combo = await mount(false)
    combo.disabled = true
    await combo.updateComplete
    await combo.focusAndOpen()
    expect(combo.open).toBe(false)
    combo.remove()
    combo.disabled = false
    await combo.focusAndOpen()
    expect(combo.open).toBe(false)
  })

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
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.focus()
    await combo.updateComplete
    expect(combo.hasAttribute("popup-open")).toBe(false)
    expect(combo.shadowRoot!.querySelector(".selection-tag-label")?.textContent).toBe("custom")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "l", bubbles: true}))
    await combo.updateComplete
    const options = combo.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="option"]')
    expect(options[1].hasAttribute("data-active")).toBe(true)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    await combo.updateComplete
    expect(changes.mock.calls.at(-1)?.[0].detail.values).toEqual(["custom", "1", "2"])
    expect(combo.hasAttribute("popup-open")).toBe(true)
    options[0].click()
    expect(changes.mock.calls.at(-1)?.[0].detail.values).toEqual(["custom", "2"])
  })

  it("shows only the tags that fit alongside the overflow count", async () => {
    const combo = await mount(false)
    combo.multiple = true
    combo.values = ["1", "2", "custom"]
    await combo.updateComplete
    const strip = combo.shadowRoot!.querySelector<HTMLElement>(".selection-tags")!
    strip.style.columnGap = "2px"
    let width = 106
    vi.spyOn(strip, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, width, 20))
    for(const tag of strip.querySelectorAll<HTMLElement>(".selection-tag")) {
      vi.spyOn(tag, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, tag.matches(".selection-tag-count") ? 20 : 40, 20))
    }
    const visible = () => [...strip.querySelectorAll(".selection-tag:not([hidden])")].map(tag => tag.textContent!.trim())
    combo.requestUpdate()
    await expect(combo.updateComplete).resolves.toBe(true)
    expect(visible()).toEqual(["Small", "Large", "+1"])

    width = 124
    combo.requestUpdate()
    await expect(combo.updateComplete).resolves.toBe(true)
    expect(visible()).toEqual(["Small", "Large", "custom"])
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

  it("displays a missing value while skipping its disabled option during keyboard selection", async () => {
    const combo = await mount(false)
    combo.value = "missing"
    combo.options = [{value: "missing", label: "Missing reference", disabled: true}, ...combo.options]
    await combo.updateComplete
    const changes = vi.fn()
    combo.addEventListener("combobox-change", changes)
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    expect(input.value).toBe("Missing reference")
    input.focus()
    await combo.updateComplete
    const missing = combo.shadowRoot!.querySelector<HTMLButtonElement>('[role="option"]')!
    expect(missing.disabled).toBe(true)
    missing.click()
    expect(changes).not.toHaveBeenCalled()
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(changes.mock.calls[0][0].detail).toEqual({value: "1"})
  })

  it("does not commit disabled presets through a typed label or an all-disabled list", async () => {
    const combo = await mount()
    combo.value = "current"
    combo.options = [{value: "missing", label: "Missing", disabled: true}]
    await combo.updateComplete
    const changes = vi.fn()
    combo.addEventListener("combobox-change", changes)
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.focus()
    input.value = "Missing"
    input.dispatchEvent(new Event("change"))
    expect(changes).not.toHaveBeenCalled()
    expect(combo.value).toBe("current")
    combo.editable = false
    await combo.updateComplete
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    expect(changes).not.toHaveBeenCalled()
  })
})
