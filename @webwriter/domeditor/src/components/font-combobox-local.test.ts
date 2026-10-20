// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {FontCombobox} from "./font-combobox"
import {embedFontFiles, type FontAccessWindow, type DeviceFont} from "../local-fonts"
import {readFontFiles, saveFontFile} from "../local-font-storage"

vi.mock("../fonts", async original => ({...await original<typeof import("../fonts")>(), bunnyFonts: vi.fn().mockResolvedValue([])}))
vi.mock("../local-fonts", async original => ({...await original<typeof import("../local-fonts")>(), embedFontFiles: vi.fn()}))
vi.mock("../local-font-storage", () => ({readFontFiles: vi.fn(), saveFontFile: vi.fn()}))
const embedded = {family: "Device Serif", value: '"Device Serif", serif', stylesheet: "data:text/css;base64,Zm9udA=="}
const fontWindow = window as FontAccessWindow & {showOpenFilePicker?: (options: object) => Promise<unknown[]>}
const file = () => new File([new Uint8Array([1, 2, 3])], "Device-Serif.ttf", {type: "font/ttf"})
const settle = async (combo: FontCombobox) => { await combo.updateComplete; await new Promise(resolve => setTimeout(resolve, 0)); await combo.updateComplete }
async function mount() {
  const combo = new FontCombobox()
  document.body.append(combo)
  await settle(combo)
  const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!
  return {combo, input, open: async () => { input.click(); await settle(combo) }}
}
beforeEach(() => {
  vi.spyOn(navigator.permissions, "query").mockResolvedValue({state: "prompt"} as PermissionStatus)
  vi.mocked(readFontFiles).mockResolvedValue([])
  vi.mocked(saveFontFile).mockResolvedValue()
  vi.mocked(embedFontFiles).mockResolvedValue(embedded)
  delete fontWindow.queryLocalFonts
  delete fontWindow.showOpenFilePicker
})
afterEach(() => {
  document.body.replaceChildren()
  delete fontWindow.queryLocalFonts
  delete fontWindow.showOpenFilePicker
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("local fonts in the family picker", () => {
  it("opens the native picker from the custom heading, remembers its handle and embeds the selected file", async () => {
    const selected = file(), handle = {name: selected.name, getFile: vi.fn().mockResolvedValue(selected)}
    fontWindow.showOpenFilePicker = vi.fn().mockResolvedValue([handle])
    const {combo, input, open} = await mount()
    expect(readFontFiles).not.toHaveBeenCalled()
    await open()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    const plus = combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Import font file"]')!
    expect(plus.closest('[aria-label="Custom fonts"]')).not.toBeNull()
    plus.click()
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce())
    await settle(combo)
    expect(fontWindow.showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({multiple: false}))
    expect(saveFontFile).toHaveBeenCalledWith(expect.objectContaining({name: "Device Serif", handle}))
    expect(changed.mock.calls[0][0].detail).toEqual({value: embedded.value, fontStylesheet: embedded.stylesheet})
    expect(input.value).toBe("Device Serif")
    expect(combo.shadowRoot!.querySelector('[role="listbox"]')).toBeNull()
  })

  it("uses an ordinary file input and persists a File when native handles are unavailable", async () => {
    const {combo, open} = await mount()
    await open()
    const chooser = combo.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    const clicked = vi.spyOn(chooser, "click").mockImplementation(() => {})
    combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Import font file"]')!.click()
    expect(clicked).toHaveBeenCalledOnce()
    const selected = file(), changed = vi.fn()
    combo.addEventListener("font-change", changed)
    Object.defineProperty(chooser, "files", {value: [selected]})
    chooser.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(saveFontFile).toHaveBeenCalledWith(expect.objectContaining({file: selected})))
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce())
  })

  it("lists installed families at the top without reading their bytes until selected", async () => {
    const normal = {family: "Device Serif", fullName: "Device Serif", style: "Regular", postscriptName: "DeviceSerif", blob: vi.fn().mockResolvedValue(file())}
    const bold = {...normal, style: "Bold", postscriptName: "DeviceSerif-Bold", blob: vi.fn().mockResolvedValue(file())}
    fontWindow.queryLocalFonts = vi.fn().mockResolvedValue([normal, bold])
    vi.mocked(readFontFiles).mockResolvedValue([{id: "saved", name: "Imported Sans", file: file()}])
    const {combo, open} = await mount()
    expect(fontWindow.queryLocalFonts).not.toHaveBeenCalled()
    await open()
    const custom = combo.shadowRoot!.querySelector('[aria-label="Custom fonts"]')!
    expect(fontWindow.queryLocalFonts).not.toHaveBeenCalled()
    expect(custom.querySelector(".browse-fonts")!.textContent).toContain("Load installed fonts")
    expect(custom.querySelector(".browse-fonts svg")).not.toBeNull()
    custom.querySelector<HTMLButtonElement>(".browse-fonts")!.click()
    await settle(combo)
    expect(custom.querySelectorAll('[role="option"]')).toHaveLength(2)
    expect(custom.querySelector('[role="option"]')!.textContent).toContain("Device Serif")
    expect(custom.querySelector('[role="separator"]')).not.toBeNull()
    const sections = [...custom.querySelectorAll(".font-section")]
    expect(sections.map(section => section.querySelector(".section-label")!.textContent)).toEqual(["INSTALLED FONTS", "Imported fonts", "WEB FONTS"])
    expect(sections[0].querySelector('[role="option"]')!.textContent).toContain("Device Serif")
    expect(sections[1].querySelector('[role="option"]')!.textContent).toContain("Imported Sans")
    expect(normal.blob).not.toHaveBeenCalled()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    custom.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce())
    expect(normal.blob).toHaveBeenCalledOnce()
    expect(bold.blob).toHaveBeenCalledOnce()
    expect(embedFontFiles).toHaveBeenCalledWith(expect.any(Array), "Device Serif")
    expect(changed.mock.calls[0][0].detail.fontStylesheet).toBe(embedded.stylesheet)
  })

  it("retries denied installed-font permission through an explicit browse button", async () => {
    fontWindow.queryLocalFonts = vi.fn().mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))
      .mockResolvedValueOnce([{family: "Device Serif", blob: vi.fn()} as unknown as DeviceFont])
    const {combo, open} = await mount()
    await open()
    expect(combo.shadowRoot!.querySelectorAll('[role="group"]')).toHaveLength(2)
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".browse-fonts")!.click()
    await settle(combo)
    expect(fontWindow.queryLocalFonts).toHaveBeenCalledTimes(1)
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".browse-fonts")!.click()
    await settle(combo)
    expect(fontWindow.queryLocalFonts).toHaveBeenCalledTimes(2)
    expect(combo.shadowRoot!.querySelector('[role="option"][title="Device Serif"]')).not.toBeNull()
  })

  it("loads an already authorized installed-font list on opening without another permission action", async () => {
    vi.mocked(navigator.permissions.query).mockResolvedValue({state: "granted"} as PermissionStatus)
    fontWindow.queryLocalFonts = vi.fn().mockResolvedValue([{family: "Device Serif", blob: vi.fn()}])
    const {combo, open} = await mount()
    expect(fontWindow.queryLocalFonts).not.toHaveBeenCalled()
    await open()
    expect(fontWindow.queryLocalFonts).toHaveBeenCalledOnce()
    expect(combo.shadowRoot!.querySelector(".browse-fonts")).toBeNull()
    expect(combo.shadowRoot!.querySelector('[role="option"][title="Device Serif"]')).not.toBeNull()
    combo.close()
    await combo.updateComplete
    expect(combo.shadowRoot!.querySelector('[role="option"]')).toBeNull()
  })

  it("filters standard families from installed, imported and online lists", async () => {
    const {bunnyFonts} = await import("../fonts")
    vi.mocked(bunnyFonts).mockResolvedValueOnce([{familyName: "Arial", category: "sans-serif", weights: [400], styles: ["normal"]}])
    fontWindow.queryLocalFonts = vi.fn().mockResolvedValue([{family: "Arial", blob: vi.fn()}, {family: "Device Serif", blob: vi.fn()}])
    vi.mocked(readFontFiles).mockResolvedValue([{id: "arial", name: "Arial", file: file()}])
    const {combo, open} = await mount()
    await open()
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".browse-fonts")!.click()
    await settle(combo)
    const custom = combo.shadowRoot!.querySelector('[aria-label="Custom fonts"]')!
    expect(custom.querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(custom.querySelector('[role="option"]')!.textContent).toContain("Device Serif")
    expect(custom.textContent).not.toContain("Arial")
    expect(combo.shadowRoot!.querySelector('[aria-label="Standard fonts"]')!.textContent).toContain("Arial")
  })

  it("limits installed and web search results to their measured half without changing the full lists", async () => {
    const {bunnyFonts} = await import("../fonts")
    vi.mocked(bunnyFonts).mockResolvedValueOnce(Array.from({length: 12}, (_, i) => ({familyName: `Search Web ${i}`, category: "sans-serif", weights: [400], styles: ["normal"]})))
    fontWindow.queryLocalFonts = vi.fn().mockResolvedValue(Array.from({length: 12}, (_, i) => ({family: `Search Installed ${i}`, blob: vi.fn()})))
    const getStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation(element => element.matches(".search-section")
      ? {gridAutoRows: "28px"} as CSSStyleDeclaration : getStyle(element))
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.matches(".search-section") ? 112 : 0 })
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return {height: this.matches(".section-label") ? 24 : 0, width: 0} as DOMRect
    })
    const {combo, input, open} = await mount()
    await open()
    expect(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] [role="option"]')).toHaveLength(12)
    combo.shadowRoot!.querySelector<HTMLButtonElement>(".browse-fonts")!.click()
    await settle(combo)
    expect(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] [role="option"]')).toHaveLength(24)
    input.value = "Search"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await settle(combo)
    const panels = [...combo.shadowRoot!.querySelectorAll(".search-section")]
    expect(panels).toHaveLength(2)
    expect(panels.map(panel => panel.querySelectorAll('[role="option"]').length)).toEqual([3, 3])
    expect(panels[0].textContent).toContain("Search Installed")
    expect(panels[1].textContent).toContain("Search Web")
    expect(combo.shadowRoot!.querySelector("[data-active]")!.textContent).toContain("Search Installed 0")
    for(let i = 0; i < 3; i++) input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    await settle(combo)
    expect(combo.shadowRoot!.querySelector("[data-active]")!.textContent).toContain("Search Web 0")
    input.value = "missing"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await settle(combo)
    expect(combo.shadowRoot!.querySelectorAll(".search-section")).toHaveLength(2)
    expect(combo.shadowRoot!.querySelectorAll('.search-section [role="option"]')).toHaveLength(0)
    input.value = ""
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await settle(combo)
    expect(combo.shadowRoot!.querySelector(".search-results")).toBeNull()
    expect(combo.shadowRoot!.querySelectorAll('[aria-label="Custom fonts"] [role="option"]')).toHaveLength(24)
  })

  it("requests restored handle permission and preserves the previous font when access fails", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied"), getFile = vi.fn()
    vi.mocked(readFontFiles).mockResolvedValue([{id: "saved", name: "Device Serif", handle: {name: "serif.ttf", getFile, requestPermission}}])
    const {combo, input, open} = await mount()
    combo.value = "Georgia, serif"
    await combo.updateComplete
    await open()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    combo.shadowRoot!.querySelector<HTMLButtonElement>('[role="option"][title^="Device Serif"]')!.click()
    await settle(combo)
    expect(requestPermission).toHaveBeenCalledWith({mode: "read"})
    expect(getFile).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
    expect(input.value).toBe("Georgia")
    expect(combo.shadowRoot!.querySelector(".local-error")!.textContent).toContain("Allow access")
  })

  it("does not apply a font that finishes loading after cancellation or disconnection", async () => {
    let resolve!: (value: typeof embedded) => void
    vi.mocked(embedFontFiles).mockReturnValue(new Promise(done => { resolve = done }))
    vi.mocked(readFontFiles).mockResolvedValue([{id: "saved", name: "Device Serif", file: file()}])
    const {combo, input, open} = await mount()
    await open()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    combo.shadowRoot!.querySelector<HTMLButtonElement>('[role="option"][title^="Device Serif"]')!.click()
    await settle(combo)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    combo.remove()
    resolve(embedded)
    await settle(combo)
    expect(changed).not.toHaveBeenCalled()
  })

  it("treats picker cancellation as a no-op and leaves invalid imports out of storage", async () => {
    fontWindow.showOpenFilePicker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
    const {combo, open} = await mount()
    await open()
    const plus = combo.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Import font file"]')!
    plus.click()
    await settle(combo)
    expect(combo.shadowRoot!.querySelector(".local-error")).toBeNull()
    fontWindow.showOpenFilePicker = vi.fn().mockResolvedValue([{getFile: async () => file()}])
    vi.mocked(embedFontFiles).mockRejectedValueOnce(new Error("Not a font"))
    plus.click()
    await settle(combo)
    expect(saveFontFile).not.toHaveBeenCalled()
    expect(combo.shadowRoot!.querySelector(".local-error")!.textContent).toBe("Not a font")
  })
})
