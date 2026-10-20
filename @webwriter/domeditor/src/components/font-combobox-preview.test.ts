// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {FontCombobox} from "./font-combobox"
import {readFontFiles} from "../local-font-storage"

vi.mock("../fonts", async original => ({...await original<typeof import("../fonts")>(), bunnyFonts: vi.fn().mockResolvedValue([
  {familyName: "Alegreya", category: "serif", weights: [400, 700], styles: ["normal", "italic"]},
  {familyName: "Arimo", category: "sans-serif", weights: [400, 700], styles: ["normal", "italic"]},
])}))
vi.mock("../local-font-storage", () => ({readFontFiles: vi.fn().mockResolvedValue([])}))
const css = (file: string) => `@font-face {font-family: Example; font-weight: 400; font-style: normal; unicode-range: U+0-FF; src: url("https://fonts.bunny.net/${file}.woff2") format("woff2");}`
const settle = async (combo: FontCombobox) => { await combo.updateComplete; await new Promise(resolve => setTimeout(resolve, 0)); await combo.updateComplete }
const search = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new InputEvent("input")) }
class PreviewFace {
  readonly loaded = Promise.resolve(this)
  constructor(readonly family: string, readonly source: string, readonly descriptors: FontFaceDescriptors) {}
}
let faces: Set<PreviewFace>, fetcher: ReturnType<typeof vi.fn>
let previousFonts: PropertyDescriptor | undefined
beforeEach(() => {
  previousFonts = Object.getOwnPropertyDescriptor(document, "fonts")
  faces = new Set()
  Object.defineProperty(document, "fonts", {configurable: true, value: faces})
  vi.stubGlobal("FontFace", PreviewFace)
  fetcher = vi.fn().mockImplementation(async () => new Response(css("example")))
  vi.stubGlobal("fetch", fetcher)
})
afterEach(() => {
  document.body.replaceChildren()
  if(previousFonts) Object.defineProperty(document, "fonts", previousFonts)
  else delete (document as unknown as {fonts?: unknown}).fonts
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

  it("previews only the highlighted web font and releases it on hover, keyboard navigation and close", async () => {
    const {combo, input} = await mount()
    const changed = vi.fn()
    combo.addEventListener("font-change", changed)
    expect(fetcher).not.toHaveBeenCalled()
    const alegreya = combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Alegreya"]')!
    const arimo = combo.shadowRoot!.querySelector<HTMLButtonElement>('[title="Arimo"]')!
    expect(alegreya.style.fontFamily).toBe("")
    expect(arimo.style.fontFamily).toBe("")
    alegreya.dispatchEvent(new Event("pointerenter"))
    await settle(combo)
    expect(alegreya.style.fontFamily).toContain("webwriter-font-preview-")
    expect(arimo.style.fontFamily).toBe("")
    expect(faces.size).toBe(1)
    const url = new URL(fetcher.mock.calls[0][0])
    expect(url.searchParams.get("family")).toBe("Alegreya:400")
    const first = [...faces][0]
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown"}))
    await settle(combo)
    expect(alegreya.style.fontFamily).toBe("")
    expect(arimo.style.fontFamily).toContain("webwriter-font-preview-")
    expect(faces.has(first)).toBe(false)
    expect(faces.size).toBe(1)
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
    expect(changed).not.toHaveBeenCalled()
    combo.close()
    await combo.updateComplete
    expect(faces.size).toBe(0)
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true)
    expect(document.head.querySelector('link[href^="https://fonts.bunny.net"]')).toBeNull()
  })

  it("previews the selected web font on opening and the best search match after typing", async () => {
    const {combo, input} = await mount('"Alegreya", serif')
    expect(fetcher).toHaveBeenCalledOnce()
    search(input, "ar")
    await settle(combo)
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("family")).toBe("Arimo:400")
    expect(combo.shadowRoot!.querySelector<HTMLButtonElement>("[data-active]")!.style.fontFamily).toContain("webwriter-font-preview-")
  })

  it("ignores a stale preview response after another search and removes faces when disconnected", async () => {
    let finish!: (response: Response) => void
    fetcher.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce(new Response(css("arimo")))
    const {combo, input} = await mount()
    search(input, "aleg")
    await settle(combo)
    search(input, "ar")
    await settle(combo)
    finish(new Response(css("alegreya")))
    await settle(combo)
    expect(faces.size).toBe(1)
    expect([...faces][0].source).toContain("/arimo.woff2")
    combo.remove()
    expect(faces.size).toBe(0)
  })

  it("leaves selection usable when preview loading fails", async () => {
    fetcher.mockRejectedValue(new Error("Offline"))
    const {combo, input} = await mount()
    search(input, "ar")
    await settle(combo)
    expect(faces.size).toBe(0)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))
    await settle(combo)
    expect(combo.value).toBe('"Arimo", sans-serif')
    expect(readFontFiles).toHaveBeenCalled()
  })

  it("preserves a hovered preview when stored font references arrive later", async () => {
    let restore!: (records: []) => void
    vi.mocked(readFontFiles).mockReturnValueOnce(new Promise(resolve => { restore = resolve }))
    const {combo} = await mount()
    combo.shadowRoot!.querySelector('[title="Alegreya"]')!.dispatchEvent(new Event("pointerenter"))
    await settle(combo)
    const face = [...faces][0]
    restore([])
    await settle(combo)
    expect(combo.shadowRoot!.querySelector('[data-active]')!.getAttribute("title")).toBe("Alegreya")
    expect(faces.has(face)).toBe(true)
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
