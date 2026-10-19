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

it("plays from a hero tap without touch hover events starting or cancelling playback", async () => {
  const buttons = [...view.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.visual")]
  expect(buttons[0].getAttribute("aria-label")).toBe("Play Document preview")
  cards()[0].dispatchEvent(new PointerEvent("pointerenter", {pointerType: "touch"}))
  expect(play).not.toHaveBeenCalled()

  buttons[0].dispatchEvent(new PointerEvent("click", {pointerType: "touch", bubbles: true}))
  await Promise.resolve()
  cards()[0].dispatchEvent(new PointerEvent("pointerleave", {pointerType: "touch"}))
  expect(videos()[0].classList.contains("playing")).toBe(true)
  expect(pause).not.toHaveBeenCalled()

  videos()[0].currentTime = 5
  buttons[0].click()
  await Promise.resolve()
  expect(videos()[0].currentTime).toBe(0)
  expect(play).toHaveBeenCalledTimes(2)

  buttons[1].click()
  await Promise.resolve()
  expect(videos()[0].classList.contains("playing")).toBe(false)
  expect(videos()[1].classList.contains("playing")).toBe(true)
})

it("allows an explicit play request with reduced motion enabled", async () => {
  vi.mocked(window.matchMedia).mockReturnValue({matches: true} as MediaQueryList)
  view.shadowRoot!.querySelector<HTMLButtonElement>("button.visual")!.click()
  await Promise.resolve()
  expect(play).toHaveBeenCalledTimes(1)
  expect(videos()[0].classList.contains("playing")).toBe(true)
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

const recordingSources = import.meta.glob("../../examples/layouts/**/*.html", {eager: true, query: "?raw", import: "default"}) as Record<string, string>

it("provides a rich-text edit and embedded, accessible media for every localized recording", () => {
  for(const locale of Object.keys(siteLanguages)) {
    for(const mode of ["document", "canvas", "slides", "board"]) {
      const path = `../../examples/layouts/${locale === "en" ? "" : `${locale}/`}${mode}.html`
      expect(recordingSources[path], path).toBeTruthy()
      const source = new DOMParser().parseFromString(recordingSources[path], "text/html")
      const sentence = source.querySelector("#edit-sentence")!
      expect(sentence?.textContent?.trim().endsWith("."), path).toBe(true)
      expect(sentence.querySelector("strong, em"), path).not.toBeNull()
      if(mode === "document") {
        expect(sentence.parentElement, path).toBe(source.body)
        expect(source.body.querySelector("article, section"), path).toBeNull()
      }
      if(mode === "slides") {
        const slide = source.querySelector(".ww-slides-viewport > .ww-slide")!
        expect(slide, path).not.toBeNull()
        expect(sentence.parentElement, path).toBe(slide)
        expect(source.querySelector(".layout-media")?.parentElement, path).toBe(slide)
        expect(slide.querySelector("article, section"), path).toBeNull()
      }
      const media = source.querySelector<HTMLElement>(".layout-media")!
      if(mode === "canvas" || mode === "slides") {
        const tag = mode === "canvas" ? "webwriter-flowchart" : "webwriter-timeline"
        expect(media?.localName, path).toBe(tag)
        expect(media.getAttribute("lang"), path).toBe(locale === "pt" ? "pt-PT" : locale)
        expect(media.getAttribute("contenteditable"), path).toBe("false")
        if(mode === "slides") {
          const events = [...media.querySelectorAll("webwriter-timeline-event")]
          expect(events.length, path).toBeGreaterThan(1)
          expect(events.every(event => event.getAttribute("lang") === (locale === "pt" ? "pt-PT" : locale) && /^\d{4}-\d{2}-\d{2}$/.test(event.getAttribute("date") ?? "")), path).toBe(true)
        }
        expect([...source.querySelectorAll<HTMLScriptElement>("script[src]")].some(script =>
          script.src.includes(`@webwriter/${mode === "canvas" ? "flowchart" : "timeline"}@`)), path).toBe(true)
        expect(media.getAttribute("aria-label"), path).toBeTruthy()
      }
      else {
        expect(media?.localName, path).toBe("img")
        expect(media.getAttribute("src"), path).toMatch(/^data:image\/svg\+xml;base64,/)
        expect(media.getAttribute("alt")?.trim(), path).toBeTruthy()
        expect(media.closest("figure")?.querySelector("figcaption")?.textContent?.trim(), path).toBeTruthy()
      }
    }
  }
})
