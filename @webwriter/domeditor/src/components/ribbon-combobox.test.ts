// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {RibbonCombobox} from "./ribbon-combobox"
import {colorPaletteStyles} from "./color-palette"

afterEach(() => document.body.replaceChildren())

it.each(["color", "background-color"])("does not select black for default or transparent %s values", async name => {
  const combo = new RibbonCombobox()
  combo.name = name
  combo.variant = "color"
  document.body.append(combo)
  await combo.updateComplete
  const changes = vi.fn()
  combo.addEventListener("ribbon-combobox-change", changes)
  const trigger = combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!
  trigger.click()
  await combo.updateComplete

  for(const value of ["", "transparent", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.5)", "rgb(55, 60, 68)"]) {
    combo.value = value
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelector('.color-swatch[aria-pressed="true"]')).toBeNull()
    expect(combo.value).toBe(value)
  }
  expect(changes).not.toHaveBeenCalled()

  combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Color #000000"]')!.click()
  await combo.updateComplete
  trigger.click()
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelector('[aria-label="Color #000000"]')!.getAttribute("aria-pressed")).toBe("true")
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".palette-automatic")!.click()
  await combo.updateComplete
  trigger.click()
  await combo.updateComplete
  expect(combo.value).toBe("")
  expect(combo.shadowRoot!.querySelector('.color-swatch[aria-pressed="true"]')).toBeNull()
})

it("uses native anchor positioning for text options and releases it on close", async () => {
  const combo = new RibbonCombobox()
  combo.options = [{label: "One", value: "one"}]
  document.body.append(combo)
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete

  const listbox = combo.shadowRoot!.querySelector<HTMLElement>(".listbox")!
  expect(listbox.style.left).toBe("")
  expect(listbox.style.top).toBe("")
  expect(listbox.style.minWidth).toBe("")

  combo.close()
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelector(".listbox")).toBeNull()
})

it("can close before its first render and reopen without changing its value", async () => {
  const combo = new RibbonCombobox()
  combo.variant = "color"
  combo.value = "#123456"

  expect(() => combo.close()).not.toThrow()
  document.body.append(combo)
  await combo.updateComplete

  expect(combo.value).toBe("#123456")
  expect(combo.shadowRoot!.querySelector(".listbox")).toBeNull()
  expect(combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.getAttribute("aria-expanded")).toBe("false")

  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.getAttribute("aria-expanded")).toBe("true")
  expect(combo.shadowRoot!.querySelector(".listbox")).not.toBeNull()
})

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
  const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[type="color"]')!
  const showPicker = vi.fn()
  Object.defineProperty(input, "showPicker", {value: showPicker})
  expect(input.value).toBe("#123456")
  expect(custom.querySelector("svg")).not.toBeNull()
  custom.click()
  expect(showPicker).toHaveBeenCalledOnce()
  expect(input.style.left).toBe("")
  expect(input.style.top).toBe("")
  expect(colorPaletteStyles.toString()).toContain("anchor(--color-palette right)")
  expect(colorPaletteStyles.toString()).toContain("position-anchor: --color-option")
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
  const preset = combo.shadowRoot!.querySelector<HTMLButtonElement>('.color-standard .color-swatch:last-child')!
  preset.focus()
  preset.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
  expect(combo.shadowRoot!.activeElement?.getAttribute("aria-label")).toBe("Custom")
  const changes = vi.fn()
  combo.addEventListener("ribbon-combobox-change", changes)
  combo.disabled = true
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLInputElement>('input[type="color"]')!.dispatchEvent(new Event("change"))
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

it.each(["color", "background-color"])("shares the toolbox palette for %s, including reset and selected shades", async name => {
  const combo = new RibbonCombobox()
  combo.name = name
  combo.variant = "color"
  combo.value = "rgb(91, 155, 213)"
  document.body.append(combo)
  await combo.updateComplete
  const changes = vi.fn()
  combo.addEventListener("ribbon-combobox-change", changes)
  const trigger = combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!
  trigger.click()
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelectorAll(".color-swatch")).toHaveLength(70)
  const swatch = combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Color #5b9bd5"]')!
  expect(swatch.getAttribute("aria-pressed")).toBe("true")
  swatch.focus()
  swatch.click()
  await combo.updateComplete
  expect(changes.mock.calls[0][0].detail).toEqual({name, value: "#5b9bd5"})
  expect(combo.shadowRoot!.querySelector(".listbox")).toBeNull()
  expect(combo.shadowRoot!.activeElement).toBe(trigger)
  trigger.click()
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".palette-automatic")!.click()
  await combo.updateComplete
  expect(changes.mock.calls[1][0].detail).toEqual({name, value: ""})
})

it("renders valid suggested colors and commits each swatch once unless disabled", async () => {
  const combo = new RibbonCombobox()
  combo.name = "accent"
  combo.label = "Accent color"
  combo.variant = "color"
  combo.swatches = ["#123456", "rebeccapurple", "red; background:url(javascript:alert(1))"]
  document.body.append(combo)
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete

  const changes = vi.fn()
  combo.addEventListener("ribbon-combobox-change", changes)
  expect(combo.shadowRoot!.querySelectorAll(".color-suggested .color-swatch")).toHaveLength(2)
  const suggested = combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Color rebeccapurple"]')!
  suggested.click()
  await combo.updateComplete
  expect(changes).toHaveBeenCalledTimes(1)
  expect(changes.mock.calls[0][0].detail).toEqual({name: "accent", value: "rebeccapurple"})

  combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
  await combo.updateComplete
  combo.disabled = true
  await combo.updateComplete
  combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Color #123456"]')!.click()
  expect(changes).toHaveBeenCalledTimes(1)
})

it("dismisses the palette on Escape or outside pointerdown without changing the color", async () => {
  const combo = new RibbonCombobox()
  combo.variant = "color"
  combo.value = "#123456"
  document.body.append(combo)
  await combo.updateComplete
  const trigger = combo.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!
  trigger.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
  await combo.updateComplete
  expect(combo.shadowRoot!.activeElement).toBe(combo.shadowRoot!.querySelector(".palette-automatic"))
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelector(".listbox")).toBeNull()
  expect(combo.shadowRoot!.activeElement).toBe(trigger)
  trigger.click()
  await combo.updateComplete
  document.body.dispatchEvent(new Event("pointerdown", {bubbles: true}))
  await combo.updateComplete
  expect(combo.shadowRoot!.querySelector(".listbox")).toBeNull()
  expect(combo.value).toBe("#123456")
})
