// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {LayoutShowcase} from "./layout-showcase"
import {setLanguage, siteLanguages} from "../site-language"

let view: LayoutShowcase
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
beforeEach(async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({matches: false} as MediaQueryList)
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  view = new LayoutShowcase()
  document.body.append(view)
  await view.updateComplete
})
afterEach(() => {view.remove(); setLanguage("en", false); vi.restoreAllMocks()})
const cards = () => [...view.shadowRoot!.querySelectorAll("article")]
const videos = () => [...view.shadowRoot!.querySelectorAll("video")]

it("switches every recording with the language and stops active playback", async () => {
  cards()[0].dispatchEvent(new Event("pointerenter"))
  await Promise.resolve()
  for(const locale of Object.keys(siteLanguages).filter(locale => locale !== "en")) {
    setLanguage(locale, false)
    await view.updateComplete
    expect(videos().map(video => video.getAttribute("src"))).toEqual(["document", "canvas", "slides", "board"].map(mode => `/src/assets/layouts/${locale}/${mode}.mp4`))
    expect(videos().every(video => !video.classList.contains("playing"))).toBe(true)
  }
  expect(pause).toHaveBeenCalled()
})

it("plays on hover, stops and rewinds on leave, and supports keyboard focus", async () => {
  cards()[0].dispatchEvent(new Event("pointerenter"))
  await Promise.resolve()
  expect(play).toHaveBeenCalledTimes(1)
  expect(videos()[0].classList.contains("playing")).toBe(true)
  videos()[0].currentTime = 3
  cards()[0].dispatchEvent(new Event("pointerleave"))
  expect(pause).toHaveBeenCalledTimes(1)
  expect(videos()[0].currentTime).toBe(0)
  expect(videos()[0].classList.contains("playing")).toBe(false)
  cards()[1].dispatchEvent(new FocusEvent("focusin"))
  await Promise.resolve()
  expect(videos()[1].classList.contains("playing")).toBe(true)
  cards()[1].dispatchEvent(new FocusEvent("focusout"))
  expect(videos()[1].classList.contains("playing")).toBe(false)
})

it("keeps the miniature for reduced motion or a failed playback attempt", async () => {
  vi.mocked(window.matchMedia).mockReturnValueOnce({matches: true} as MediaQueryList)
  cards()[0].dispatchEvent(new Event("pointerenter"))
  expect(play).not.toHaveBeenCalled()
  play.mockRejectedValueOnce(new Error("Playback unavailable"))
  cards()[1].dispatchEvent(new Event("pointerenter"))
  await Promise.resolve()
  expect(videos()[1].classList.contains("playing")).toBe(false)
})

it("does not reveal or keep playing a clip whose hover ended while loading", async () => {
  let resolve!: () => void
  play.mockReturnValueOnce(new Promise<void>(done => {resolve = done}))
  cards()[0].dispatchEvent(new Event("pointerenter"))
  cards()[0].dispatchEvent(new Event("pointerleave"))
  resolve()
  await Promise.resolve()
  expect(videos()[0].classList.contains("playing")).toBe(false)
  expect(pause).toHaveBeenCalledTimes(2)
})

it("stops playback when the component is removed", async () => {
  cards()[2].dispatchEvent(new FocusEvent("focusin"))
  await Promise.resolve()
  view.remove()
  expect(pause).toHaveBeenCalledTimes(1)
  expect(videos()[2].currentTime).toBe(0)
})
