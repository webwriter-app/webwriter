// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {RibbonCombobox} from "./ribbon-combobox"

afterEach(() => document.body.replaceChildren())

it.each(["color", "background-color"])("picks a custom %s without committing when the picker opens", async name => {
  const combo = new RibbonCombobox()
  combo.name = name
  combo.label = name === "color" ? "Text color" : "Text background color"
  combo.variant = "color"
  combo.options = [{label: "Default", value: ""}, {label: "Black", value: "#000000"}]
  combo.value = "rgb(18, 52, 86)"
  document.body.append(combo)
  await combo.updateComplete
  const changes = vi.fn()
  const selection = vi.fn()
  combo.addEventListener("ribbon-combobox-change", changes)
  combo.addEventListener("ribbon-input-pointerdown", selection)
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete
  const custom = combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Custom"]')!
  const input = combo.shadowRoot!.querySelector<HTMLInputElement>('.custom-color-input')!
  const showPicker = vi.fn()
  Object.defineProperty(input, "showPicker", {value: showPicker})
  vi.spyOn(combo.shadowRoot!.querySelector<HTMLElement>(".listbox")!, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(20, 30, 160, 100))
  vi.spyOn(custom, "getBoundingClientRect").mockReturnValue(new DOMRect(24, 100, 152, 26))
  expect(input.value).toBe("#123456")
  expect(custom.getAttribute("aria-selected")).toBe("true")
  expect(custom.querySelector(".custom-color-preview")).not.toBeNull()
  custom.click()
  expect(showPicker).toHaveBeenCalledOnce()
  expect(input.style.left).toBe("184px")
  expect(input.style.top).toBe("99px")
  expect(selection.mock.calls[0][0].detail.input).toBe(input)
  expect(changes).not.toHaveBeenCalled()
  expect(combo.value).toBe("rgb(18, 52, 86)")
  input.value = "#abcdef"
  input.dispatchEvent(new Event("change", {bubbles: true}))
  await combo.updateComplete
  expect(changes.mock.calls[0][0].detail).toEqual({name, value: "#abcdef"})
  expect(combo.shadowRoot!.querySelector(".listbox")).toBeNull()
  expect(combo.shadowRoot!.querySelector(".color-preview")!.getAttribute("style")).toContain("#abcdef")
})

it("includes Custom in keyboard navigation and ignores disabled color changes", async () => {
  const combo = new RibbonCombobox()
  combo.name = "color"
  combo.variant = "color"
  combo.options = [{label: "Black", value: "#000000"}]
  document.body.append(combo)
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete
  const preset = combo.shadowRoot!.querySelector<HTMLButtonElement>('.option')!
  preset.focus()
  preset.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
  expect(combo.shadowRoot!.activeElement?.getAttribute("aria-label")).toBe("Custom")
  const changes = vi.fn()
  combo.addEventListener("ribbon-combobox-change", changes)
  combo.disabled = true
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLInputElement>(".custom-color-input")!.dispatchEvent(new Event("change"))
  expect(changes).not.toHaveBeenCalled()
})

it("keeps custom colors out of text menus", async () => {
  const combo = new RibbonCombobox()
  document.body.append(combo)
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelector('[aria-label="Custom"]')).toBeNull()
  expect(combo.shadowRoot!.querySelector('input[type="color"]')).toBeNull()
})
