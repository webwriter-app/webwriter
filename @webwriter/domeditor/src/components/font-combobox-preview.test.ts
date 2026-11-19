// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {FontCombobox} from "./font-combobox"
import {readFontFiles} from "../local-font-storage"
import {fontPreview} from "../font-previews"

vi.mock("../fonts", async original => ({...await original<typeof import("../fonts")>(), bunnyFonts: vi.fn().mockResolvedValue([
  {familyName: "Alegreya", category: "serif", weights: [400, 700], styles: ["normal", "italic"]},
  {familyName: "Arimo", category: "sans-serif", weights: [400, 700], styles: ["normal", "italic"]},
])}))
vi.mock("../local-font-storage", () => ({readFontFiles: vi.fn().mockResolvedValue([])}))
const settle = async (combo: FontCombobox) => { await combo.updateComplete; await new Promise(resolve => setTimeout(resolve, 0)); await combo.updateComplete }
const search = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new InputEvent("input")) }
let fetcher: ReturnType<typeof vi.fn>, createFace: ReturnType<typeof vi.fn>
beforeEach(() => {
  Object.defineProperty(document, "fonts", {value: new Set<FontFace>(), configurable: true})
  createFace = vi.fn(function(this: {family: string, status: string}, family: string) { this.family = family; this.status = "unloaded" })
  vi.stubGlobal("FontFace", createFace)
  fetcher = vi.fn().mockResolvedValue(new Response(""))
  vi.stubGlobal("fetch", fetcher)
})
afterEach(() => {
  document.body.replaceChildren()
  Reflect.deleteProperty(document, "fonts")
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
async function mount(value = "") {
  const combo = new FontCombobox()
  combo.value = value
  document.body.append(combo)
  await combo.updateComplete
  const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!
  input.click()
  await settle(combo)
  return {combo, input}
}

describe("font option previews", () => {
  it("offers only bundled formula fonts and emits their embedded stylesheet", async () => {
    const combo = new FontCombobox()
    combo.mathOnly = true
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    document.body.append(combo)
    await settle(combo)
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!
    expect(input.placeholder).toBe("Default math")
    input.click()
    await settle(combo)
    expect(input.placeholder).toBe("Search...")
    expect(fetcher).not.toHaveBeenCalled()
    expect([...combo.shadowRoot!.querySelectorAll('[role="option"]')].map(option => option.getAttribute("title")))
      .toEqual(["Default math", "Libertinus Math", "Noto Sans Math"])
    combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Libertinus Math"]')!.click()
    await settle(combo)
    expect(changed.mock.calls[0]?.[0].detail).toMatchObject({
      value: '"Libertinus Math", math',
      fontStylesheet: expect.stringMatching(/^data:text\/css;base64,/),
    })
  })

  it("previews bundled math fonts before selection and removes only its own faces on close", async () => {
    const authoredFace = new FontFace("Authored font", 'url("authored.woff2")')
    document.fonts.add(authoredFace)
    createFace.mockClear()
    const combo = new FontCombobox()
    combo.mathOnly = true
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    document.body.append(combo)
    await settle(combo)
    expect(createFace).not.toHaveBeenCalled()
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.click()
    await settle(combo)
    expect(createFace.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ["WebWriter preview Libertinus Math", expect.stringContaining("LibertinusMath-Regular.woff2")],
      ["WebWriter preview Noto Sans Math", expect.stringContaining("NotoSansMath-Regular.woff2")],
    ])
    for(const label of ["Libertinus Math", "Noto Sans Math"]) {
      const option = combo.shadowRoot!.querySelector<HTMLButtonElement>(`[title="${label}"]`)!
      expect(option.style.fontFamily).toBe(`"WebWriter preview ${label}", math`)
      option.dispatchEvent(new Event("pointerenter"))
      await settle(combo)
      expect(option.hasAttribute("data-active")).toBe(true)
    }
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Default math"]')!.style.fontFamily).toBe("")
    expect(changed).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    const faces = createFace.mock.instances as FontFace[]
    expect(faces.every(face => document.fonts.has(face))).toBe(true)
    combo.close()
    await settle(combo)
    expect(faces.every(face => !document.fonts.has(face))).toBe(true)
    expect(document.fonts.has(authoredFace)).toBe(true)
    input.click()
    await settle(combo)
    expect(createFace).toHaveBeenCalledTimes(4)
    combo.mathOnly = false
    await settle(combo)
    expect((createFace.mock.instances as FontFace[]).every(face => !document.fonts.has(face))).toBe(true)
    combo.mathOnly = true
    await settle(combo)
    input.click()
    await settle(combo)
    combo.remove()
    expect((createFace.mock.instances as FontFace[]).every(face => !document.fonts.has(face))).toBe(true)
    document.fonts.delete(authoredFace)
  })

  it("renders standard and installed options in their own fonts without reading local files", async () => {
    const blob = vi.fn()
    const combo = new FontCombobox()
    Object.assign(combo, {devices: [{family: "Device Serif", blob}], fontAccess: {}})
    document.body.append(combo)
    await combo.updateComplete
    combo.shadowRoot!.querySelector<HTMLInputElement>('input[role="combobox"]')!.click()
    await settle(combo)
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Georgia"]')!.style.fontFamily).toBe("Georgia, serif")
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Device Serif"]')!.style.fontFamily).toContain('"Device Serif"')
    expect(blob).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("previews every web font immediately using lazy rows from shared sprite images", async () => {
    const {combo, input} = await mount()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    const alegreya = combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Alegreya"]')!
    const arimo = combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Arimo"]')!
    const first = alegreya.querySelector("img")!, second = arimo.querySelector("img")!
    for(const image of [first, second]) {
      expect(image.getAttribute("loading")).toBe("lazy")
      expect(image.getAttribute("srcset")).toMatch(/chunk-\d+\.webp.* 2x$/)
      expect(image.getAttribute("alt")).toBe("")
      expect(image.getAttribute("aria-hidden")).toBe("true")
      expect(image.width).toBe(160)
      expect(image.height).toBe(24)
    }
    expect(first.getAttribute("srcset")).toBe(`${fontPreview("Alegreya")!.url} 2x`)
    expect(second.style.objectPosition).toBe(`left -${fontPreview("Arimo")!.offset}px`)
    expect(alegreya.textContent).toContain("Alegreya")
    alegreya.dispatchEvent(new Event("pointerenter"))
    await settle(combo)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    await settle(combo)
    expect(combo.shadowRoot!.querySelector("[data-active]")!.getAttribute("title")).toBe("Arimo")
    expect(changed).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    expect(createFace).not.toHaveBeenCalled()
    combo.close()
    await settle(combo)
    expect(combo.shadowRoot!.querySelector(".font-preview")).toBeNull()
    expect(document.head.querySelector('link[href^="https://fonts.bunny.net"]')).toBeNull()
  })

  it("keeps sprite coordinates stable when search changes the option index", async () => {
    const {combo, input} = await mount('"Alegreya", serif')
    const image = combo.shadowRoot!.querySelector<HTMLImageElement>('[title="Arimo"] img')!
    const source = image.getAttribute("srcset"), offset = image.style.objectPosition
    search(input, "ar")
    await settle(combo)
    const result = combo.shadowRoot!.querySelector<HTMLImageElement>('[title="Arimo"] img')!
    expect(result.getAttribute("srcset")).toBe(source)
    expect(result.style.objectPosition).toBe(offset)
    expect(combo.shadowRoot!.querySelector("[data-active]")!.getAttribute("title")).toBe("Arimo")
    expect(fetcher).not.toHaveBeenCalled()
    expect(createFace).not.toHaveBeenCalled()
  })

  it("retains readable labels and font application if a sprite fails", async () => {
    const {combo, input} = await mount()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    search(input, "ar")
    await settle(combo)
    const option = combo.shadowRoot!.querySelector('[title="Arimo"]')!
    const image = option.querySelector("img")!
    image.dispatchEvent(new Event("load"))
    expect(image.hasAttribute("data-loaded")).toBe(true)
    image.dispatchEvent(new Event("error"))
    expect(image.hasAttribute("data-loaded")).toBe(false)
    expect(option.querySelector(".font-preview-fallback")!.textContent).toBe("Arimo")
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    await settle(combo)
    expect(combo.value).toBe('"Arimo", sans-serif')
    expect(changed.mock.calls[0][0].detail).toMatchObject({
      value: '"Arimo", sans-serif', fontStylesheet: expect.stringContaining("https://fonts.bunny.net/css?"),
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(createFace).not.toHaveBeenCalled()
  })

  it("falls back to a text label for new catalog families without a bundled preview", async () => {
    const {combo} = await mount()
    combo.options = [{label: "Future Font", value: '"Future Font", serif', group: "Custom fonts"}]
    await settle(combo)
    const option = combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Future Font"]')!
    expect(option.querySelector("img")).toBeNull()
    expect(option.textContent).toContain("Future Font")
    option.click()
    await settle(combo)
    expect(combo.value).toBe('"Future Font", serif')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("preserves the active font when stored font references arrive later", async () => {
    let restore!: (records: []) => void
    vi.mocked(readFontFiles).mockReturnValueOnce(new Promise(resolve => { restore = resolve }))
    const {combo} = await mount()
    combo.shadowRoot!.querySelector('[title="Alegreya"]')!.dispatchEvent(new Event("pointerenter"))
    await settle(combo)
    restore([])
    await settle(combo)
    const active = combo.shadowRoot!.querySelector('[data-active]')!
    expect(active.getAttribute("title")).toBe("Alegreya")
    expect(active.querySelector("img")!.getAttribute("srcset")).toBe(`${fontPreview("Alegreya")!.url} 2x`)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
