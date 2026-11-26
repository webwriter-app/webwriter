// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {LiveSessionShowcase} from "./live-session-showcase"
import {setLanguage, siteLanguages} from "../site-language"
import {siteTranslations} from "../site-translations"

let view: LiveSessionShowcase
async function mount(reducedMotion = true) {
  vi.spyOn(window, "matchMedia").mockReturnValue({matches: reducedMotion} as MediaQueryList)
  view = new LiveSessionShowcase()
  view.innerHTML = `<p slot="status">Work in progress.</p>` + ["share", "groups", "permissions"].map(slot => `<article slot="${slot}"><h3>${slot}</h3></article>`).join("")
  document.body.append(view)
  await view.updateComplete
}
afterEach(() => {
  view?.remove()
  setLanguage("en", false)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const $ = (selector: string) => view.shadowRoot!.querySelector<HTMLElement>(selector)
const all = (selector: string) => [...view.shadowRoot!.querySelectorAll<HTMLElement>(selector)]
const button = (name: string) => all("button").find(button => (button.getAttribute("aria-label") ?? button.textContent!.trim()) === name) as HTMLButtonElement
const update = async (action: () => void) => { action(); await view.updateComplete }

it("rests the page notice on the scene and gives each card a numbered place", async () => {
  await mount()
  expect(all("slot").map(slot => (slot as HTMLSlotElement).name)).toEqual(["status", "share", "groups", "permissions"])
  expect($(".status")!.nextElementSibling?.classList.contains("stage")).toBe(true)
  expect(all(".callout .number").map(number => number.textContent)).toEqual(["1", "2", "3"])
  expect(all(".marker").map(marker => marker.textContent)).toEqual(["1", "2", "3"])
})

it("lets learners join once the scene is seen", async () => {
  let notify!: IntersectionObserverCallback
  const observe = vi.fn(), disconnect = vi.fn()
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { notify = callback }
    observe = observe
    disconnect = disconnect
  })
  vi.useFakeTimers()
  await mount(false)
  expect(observe).toHaveBeenCalledWith(view)
  expect(button("Share").getAttribute("aria-checked")).toBe("false")
  expect($(".join")).not.toBeNull()
  expect(all(".seats .avatar")).toHaveLength(0)
  notify([{isIntersecting: true} as IntersectionObserverEntry], {} as IntersectionObserver)
  expect(disconnect).toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(600)
  await view.updateComplete
  expect(button("Share").getAttribute("aria-checked")).toBe("true")
  expect(all(".seats .avatar").map(avatar => avatar.textContent)).toEqual(["L7", "LK", "LQ", "LM", "LB", "LT"])
  expect($(".join")).toBeNull()
  expect($(".learner")).not.toBeNull()
})

it("starts shared for reduced motion and stops or restarts sharing from the switch", async () => {
  await mount()
  expect(button("Share").getAttribute("aria-checked")).toBe("true")
  await update(() => button("Share").click())
  expect(button("Share").getAttribute("aria-checked")).toBe("false")
  expect($(".link")!.textContent).toBe("")
  expect($(".join")).not.toBeNull()
  await update(() => button("Share").click())
  expect($(".link")!.textContent).toBe("webwriter.app/join/…")
})

it("forms groups and shows the learner's group on the phone", async () => {
  await mount()
  const groupStarts = () => all(".seat").map(seat => seat.hasAttribute("data-start"))
  const label = () => $(".size")!.textContent!.replace(/\s+/g, "")
  expect(label()).toBe("pair")
  expect(groupStarts()).toEqual([true, false, true, false, true, false])
  expect(all(".mates .avatar")).toHaveLength(2)
  await update(() => button("Bigger group").click())
  expect(label()).toBe("×3groups")
  expect(groupStarts()).toEqual([true, false, false, true, false, false])
  expect(all(".mates .avatar")).toHaveLength(3)
  expect(all(".cursor")).toHaveLength(2)
  await update(() => button("All").click())
  expect(button("All").getAttribute("aria-pressed")).toBe("true")
  expect(groupStarts()).toEqual([true, false, false, false, false, false])
  expect(all(".mates .avatar")).toHaveLength(6)
  expect(all(".cursor")).toHaveLength(3)
  await update(() => button("Smaller group").click())
  expect(button("All").getAttribute("aria-pressed")).toBe("false")
  expect(label()).toBe("pair")
  await update(() => button("Smaller group").click())
  expect(label()).toBe("single")
  expect(groupStarts()).toEqual([true, true, true, true, true, true])
  expect(button("Smaller group").disabled).toBe(true)
})

it("keeps hidden parts and blocked changes off the learner's phone", async () => {
  await mount()
  expect($(".page .notes")!.hasAttribute("data-hidden")).toBe(true)
  expect($(".learner .notes")).toBeNull()
  await update(() => button("View").click())
  expect(button("View").getAttribute("aria-pressed")).toBe("true")
  expect($(".learner .notes")).not.toBeNull()
  expect($(".typed")).not.toBeNull()
  expect($(".lock")).toBeNull()
  await update(() => button("Edit").click())
  expect(button("Edit").getAttribute("aria-pressed")).toBe("false")
  expect($(".typed")).toBeNull()
  expect($(".lock")).not.toBeNull()
  expect($(".note[data-moving]")).toBeNull()
  await update(() => button("Move").click())
  expect($(".learner .note[data-moving]")).not.toBeNull()
})

it("pairs each card with the controls it explains", async () => {
  await mount()
  await update(() => view.querySelector('[slot="status"]')!.dispatchEvent(new Event("pointerover", {bubbles: true, composed: true})))
  expect($(".showcase")!.hasAttribute("data-active")).toBe(false)
  await update(() => view.querySelector('[slot="share"]')!.dispatchEvent(new Event("pointerover", {bubbles: true, composed: true})))
  expect($(".showcase")!.dataset.active).toBe("share")
  expect($('.callout[data-step="share"]')!.hasAttribute("data-active")).toBe(true)
  expect($(".qr-popover")).not.toBeNull()
  await update(() => button("Edit").dispatchEvent(new FocusEvent("focusin", {bubbles: true, composed: true})))
  expect($(".showcase")!.dataset.active).toBe("permissions")
  expect($(".qr-popover")).toBeNull()
  await update(() => view.dispatchEvent(new Event("pointerleave")))
  expect($(".showcase")!.hasAttribute("data-active")).toBe(false)
})

it("localizes the scene's controls in every site language", async () => {
  await mount()
  for(const locale of Object.keys(siteLanguages).filter(locale => locale !== "en")) {
    const copy = siteTranslations[locale]
    for(const key of ["Live session preview", "Share", "single", "pair", "groups", "All", "Smaller group", "Bigger group", "View", "Edit", "Move", "Learner view"]) {
      expect(copy[key], `${locale}: ${key}`).toBeTruthy()
    }
    await update(() => setLanguage(locale, false))
    expect($(".stage")!.getAttribute("aria-label")).toBe(copy["Live session preview"])
    expect(button(copy.Share).getAttribute("role")).toBe("switch")
    expect(button(copy.Edit)).toBeTruthy()
    expect($(".phone-label")!.textContent).toBe(copy["Learner view"])
  }
})
