// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {FontSizeCombobox} from "./font-size-combobox"
import {fontSizeOptions} from "../marks"

afterEach(() => document.body.replaceChildren())

async function mount(value = "16px") {
  const combo = new FontSizeCombobox()
  combo.label = "Font size"
  combo.value = value
  document.body.append(combo)
  await combo.updateComplete
  const input = combo.shadowRoot!.querySelector("input")!
  input.focus()
  await combo.updateComplete
  const changes = vi.fn()
  combo.addEventListener("combobox-change", changes)
  return {combo, input, changes}
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new InputEvent("input"))
}

describe("font size combobox", () => {
  it("focuses and selects the number when opened from its dropdown arrow", async () => {
    const combo = new FontSizeCombobox()
    combo.value = "16px"
    document.body.append(combo)
    await combo.updateComplete
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await combo.updateComplete
    const input = combo.shadowRoot!.querySelector("input")!
    await vi.waitFor(() => expect(combo.shadowRoot!.activeElement).toBe(input))
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    type(input, "19")
    await combo.updateComplete
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2])
  })

  it("accepts a custom number while keeping every preset visible", async () => {
    const {combo, input, changes} = await mount()
    expect(input.readOnly).toBe(false)
    expect(input.inputMode).toBe("decimal")
    expect(input.value).toBe("16")
    type(input, "17.5")
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(fontSizeOptions.length)
    expect(combo.value).toBe("16px")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    await combo.updateComplete
    expect(changes.mock.calls[0][0].detail).toEqual({value: "17.5px"})
    expect(input.value).toBe("17.5")
    expect(combo.shadowRoot!.querySelector('[role="listbox"]')).toBeNull()
  })

  it.each([
    ["19", "19px"], ["19.5", "19.5px"], [".5", "0.5px"], ["0", "0px"],
    [" 18px ", "18px"], ["2rem", "2px"], ["12 pt", "12px"], ["125%", "125px"],
    ["1e2em", "100px"], ["", ""],
  ])("interprets %s as %s when confirmed", async (text, expected) => {
    const {combo, input, changes} = await mount()
    type(input, text)
    input.dispatchEvent(new Event("change"))
    await combo.updateComplete
    expect(combo.value).toBe(expected)
    expect(changes.mock.calls[0][0].detail.value).toBe(expected)
    expect(combo.shadowRoot!.querySelector('[role="listbox"]')).toBeNull()
  })

  it.each(["-1", "abc", "Infinity", "1e999", "calc(12px + 1em)", "12 14", "1.2.3", "0x10"])("preserves the previous value for invalid input %s", async text => {
    const {combo, input, changes} = await mount()
    type(input, text)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    await combo.updateComplete
    expect(combo.value).toBe("16px")
    expect(input.value).toBe("16")
    expect(changes).not.toHaveBeenCalled()
  })

  it("keeps preset selection and keyboard navigation available after typing", async () => {
    const {combo, input, changes} = await mount()
    type(input, "123")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    await combo.updateComplete
    expect(changes.mock.calls[0][0].detail.value).toBe("8px")
    input.click()
    await combo.updateComplete
    combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="24 px"]')!.click()
    await combo.updateComplete
    expect(changes.mock.calls[1][0].detail.value).toBe("24px")
    expect(input.value).toBe("24")
  })

  it("cancels drafts with Escape and disables both input and toggle", async () => {
    const {combo, input, changes} = await mount()
    type(input, "28pt")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await combo.updateComplete
    expect(input.value).toBe("16")
    expect(changes).not.toHaveBeenCalled()
    combo.disabled = true
    await combo.updateComplete
    expect(input.disabled).toBe(true)
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.disabled).toBe(true)
  })
})
