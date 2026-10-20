// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {bunnyFonts, bunnyFontValue} from "../fonts"
import {FontCombobox} from "./font-combobox"

vi.mock("../fonts", async original => ({...await original<typeof import("../fonts")>(), bunnyFonts: vi.fn()}))
const fonts = [
  {familyName: "Alegreya", category: "serif", weights: [400, 700], styles: ["normal", "italic"]},
  {familyName: "Arimo", category: "sans-serif", weights: [400], styles: ["normal"]},
]
beforeEach(() => vi.mocked(bunnyFonts).mockResolvedValue(fonts))
afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks() })
const settle = async (combo: FontCombobox) => { await combo.updateComplete; await new Promise(resolve => setTimeout(resolve, 0)); await combo.updateComplete }
async function mount() {
  const combo = new FontCombobox()
  document.body.append(combo)
  await combo.updateComplete
  const input = combo.shadowRoot!.querySelector("input")!
  input.focus()
  await settle(combo)
  return {combo, input}
}
function search(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new InputEvent("input"))
}

describe("font search combobox", () => {
  it("abbreviates Times New Roman while applying its full font family", async () => {
    const {combo, input} = await mount()
    const option = combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Times New Rom."]')!
    expect(option.textContent).toContain("Times New Rom.")
    option.click()
    await combo.updateComplete
    expect(combo.value).toBe('"Times New Roman", serif')
    expect(input.value).toBe("Times New Rom.")
  })

  it("shows the default as a placeholder and clears the input when selecting it", async () => {
    const {combo, input} = await mount()
    expect(input.value).toBe("")
    expect(input.placeholder).toBe("Default font")
    combo.close()
    combo.value = "Georgia, serif"
    await combo.updateComplete
    input.click()
    await settle(combo)
    expect(input.value).toBe("Georgia")
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Default font"]')!.click()
    await combo.updateComplete
    expect(changed.mock.calls[0][0].detail).toEqual({value: ""})
    expect(combo.value).toBe("")
    expect(input.value).toBe("")
    expect(input.placeholder).toBe("Default font")
    input.click()
    await settle(combo)
    expect(input.value).toBe("")
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(10)
  })

  it("selects all input text and shows unfiltered lists on every opening until typing", async () => {
    const combo = new FontCombobox()
    combo.value = "Georgia, serif"
    document.body.append(combo)
    await combo.updateComplete
    const input = combo.shadowRoot!.querySelector("input")!
    const toggle = combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
    toggle.click()
    await settle(combo)
    expect(input.value).toBe("Georgia")
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length])
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(10)
    expect(combo.shadowRoot!.querySelector("[data-active]")).toBeNull()
    search(input, "ar")
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(2)
    toggle.click()
    await combo.updateComplete
    input.click()
    await settle(combo)
    expect(input.value).toBe("Georgia")
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length])
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(10)
    expect(combo.shadowRoot!.querySelector("[data-active]")).toBeNull()
  })

  it.each(["Georgia, serif", ""])("restores the previous font or default on blank confirmation (%s)", async value => {
    const {combo, input} = await mount()
    combo.close()
    combo.value = value
    await combo.updateComplete
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await settle(combo)
    search(input, "   ")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", cancelable: true}))
    await combo.updateComplete
    expect(combo.value).toBe(value)
    expect(input.value).toBe(value ? "Georgia" : "")
    expect(changed).not.toHaveBeenCalled()
    expect(combo.hasAttribute("open")).toBe(false)
    input.focus()
    await settle(combo)
    search(input, "")
    input.dispatchEvent(new Event("change"))
    await combo.updateComplete
    expect(combo.value).toBe(value)
    expect(input.value).toBe(value ? "Georgia" : "")
    expect(changed).not.toHaveBeenCalled()
  })

  it("highlights the best custom match, completes it with Tab and applies it with Enter", async () => {
    const {combo, input} = await mount()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    search(input, "ar")
    await combo.updateComplete
    const active = combo.shadowRoot!.querySelector<HTMLElement>("[data-active]")!
    expect(active.textContent).toContain("Arimo")
    expect(input.getAttribute("aria-activedescendant")).toBe(active.id)
    const tab = new KeyboardEvent("keydown", {key: "Tab", cancelable: true})
    input.dispatchEvent(tab)
    await combo.updateComplete
    expect(tab.defaultPrevented).toBe(true)
    expect(input.value).toBe("Arimo")
    expect(changed).not.toHaveBeenCalled()
    const nextTab = new KeyboardEvent("keydown", {key: "Tab", cancelable: true})
    input.dispatchEvent(nextTab)
    expect(nextTab.defaultPrevented).toBe(false)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    await combo.updateComplete
    expect(changed.mock.calls[0][0].detail.value).toBe(bunnyFontValue(fonts[1]))
  })

  it("ranks exact and prefix custom matches ahead of substring matches", async () => {
    vi.mocked(bunnyFonts).mockResolvedValueOnce(["Noto Sans", "Sansita", "Sans"].map(familyName => ({...fonts[0], familyName})))
    const {combo, input} = await mount()
    search(input, "sans")
    await combo.updateComplete
    const matches = Array.from(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] .option-code'), option => option.textContent)
    expect(matches).toEqual(["Sans", "Sansita", "Noto Sans"])
    expect(combo.shadowRoot!.querySelector("[data-active]")!.textContent).toContain("Sans")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    expect(combo.value).toBe(bunnyFontValue({...fonts[0], familyName: "Sans"}))
  })

  it("does not intercept Tab without a custom match, before typing, with Shift, or during composition", async () => {
    const {combo, input} = await mount()
    for(const [query, extra] of [[null, {}], ["ar", {shiftKey: true}], ["ar", {isComposing: true}], ["zzzz", {}], ["Georgia", {}]] as const) {
      if(query !== null) search(input, query)
      const tab = new KeyboardEvent("keydown", {key: "Tab", cancelable: true, ...extra})
      input.dispatchEvent(tab)
      expect(tab.defaultPrevented).toBe(false)
    }
    search(input, "Georgia")
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelector("[data-active]")!.textContent).toContain("Georgia")
  })

  it("highlights matching custom fonts when the catalog arrives after typing", async () => {
    let resolve!: (value: typeof fonts) => void
    vi.mocked(bunnyFonts).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const {combo, input} = await mount()
    search(input, "ar")
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelector("[data-active]")!.textContent).toContain("Arial")
    resolve(fonts)
    await settle(combo)
    expect(combo.shadowRoot!.querySelector("[data-active]")!.textContent).toContain("Arimo")
  })

  it("fetches only on opening and mounts custom options only until the dropdown closes", async () => {
    const combo = new FontCombobox()
    document.body.append(combo)
    await settle(combo)
    expect(bunnyFonts).not.toHaveBeenCalled()
    expect(combo.shadowRoot!.querySelector('[role="listbox"]')).toBeNull()
    expect(combo.options).toHaveLength(8)
    const toggle = combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
    toggle.click()
    await settle(combo)
    expect(bunnyFonts).toHaveBeenCalledTimes(1)
    expect(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] [role="option"]')).toHaveLength(2)
    toggle.click()
    await settle(combo)
    expect(combo.shadowRoot!.querySelector('[role="listbox"]')).toBeNull()
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(combo.options).toHaveLength(8)
    combo.shadowRoot!.querySelector<HTMLInputElement>("input")!.click()
    await settle(combo)
    expect(bunnyFonts).toHaveBeenCalledTimes(1)
    expect(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] [role="option"]')).toHaveLength(2)
    combo.remove()
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(combo.options).toHaveLength(8)
  })

  it("does not populate options when a pending catalog fetch resolves after closing", async () => {
    let resolve!: (value: typeof fonts) => void
    vi.mocked(bunnyFonts).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const {combo} = await mount()
    expect(combo.shadowRoot!.textContent).toContain("Loading fonts")
    combo.close()
    await combo.updateComplete
    resolve(fonts)
    await settle(combo)
    expect(combo.options).toHaveLength(8)
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0)
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await settle(combo)
    expect(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] [role="option"]')).toHaveLength(2)
    expect(bunnyFonts).toHaveBeenCalledTimes(1)
  })

  it("filters two stable columns independently and emits a font stack plus its stylesheet", async () => {
    const {combo, input} = await mount()
    expect(input.readOnly).toBe(false)
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    search(input, "ar")
    await combo.updateComplete
    const groups = combo.shadowRoot!.querySelectorAll('[role="group"]')
    expect(Array.from(groups, group => group.getAttribute("aria-label"))).toEqual(["Standard fonts", "Custom fonts"])
    expect(groups[0].querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(groups[0].textContent).toContain("Arial")
    expect(groups[1].querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(groups[1].textContent).toContain("Arimo")
    groups[1].querySelector<HTMLButtonElement>('[role="option"]')!.click()
    expect(changed.mock.calls[0][0].detail.value).toBe(bunnyFontValue(fonts[1]))
    expect(new URL(changed.mock.calls[0][0].detail.fontStylesheet).hostname).toBe("fonts.bunny.net")
    await combo.updateComplete
    expect(combo.hasAttribute("open")).toBe(false)
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(combo.options).toHaveLength(8)
    expect(input.value).toBe("Arimo")
  })

  it("selects search results by keyboard and discards unmatched search text", async () => {
    const {combo, input} = await mount()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    search(input, "aleg")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    expect(changed.mock.calls[0][0].detail.value).toBe(bunnyFontValue(fonts[0]))
    await combo.updateComplete
    search(input, "not-a-font")
    await settle(combo)
    expect(combo.shadowRoot!.querySelectorAll('[role="group"]')).toHaveLength(2)
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0)
    input.dispatchEvent(new Event("change"))
    await combo.updateComplete
    expect(changed).toHaveBeenCalledTimes(1)
    expect(input.value).toBe("Alegreya")
  })

  it("recognizes browser-normalized family names without displaying the fallback", async () => {
    const {combo, input} = await mount()
    combo.close()
    combo.value = "Alegreya, serif"
    await combo.updateComplete
    expect(input.value).toBe("Alegreya")
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelector('[aria-selected="true"]')?.textContent).toContain("Alegreya")
    search(input, "ar")
    await combo.updateComplete
    search(input, "aleg")
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(combo.shadowRoot!.querySelector('[role="option"]')!.textContent).toContain("Alegreya")
  })

  it("retains standard fonts during a catalog failure and retries when reopened", async () => {
    vi.mocked(bunnyFonts).mockRejectedValueOnce(new Error("offline"))
    const {combo, input} = await mount()
    expect(combo.shadowRoot!.textContent).toContain("Reopen to retry")
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(8)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await combo.updateComplete
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await settle(combo)
    expect(combo.shadowRoot!.textContent).toContain("Alegreya")
    combo.disabled = true
    await combo.updateComplete
    expect(input.disabled).toBe(true)
    expect(combo.hasAttribute("open")).toBe(false)
    expect(combo.shadowRoot!.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(combo.options).toHaveLength(8)
  })
})
