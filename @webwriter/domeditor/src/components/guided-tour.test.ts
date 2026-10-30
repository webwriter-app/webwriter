// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {GuidedTour} from "./guided-tour"

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

const mount = async () => {
  const anchor = document.createElement("button")
  document.body.append(anchor)
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 40, 80, 30))
  const tour = new GuidedTour()
  tour.anchor = () => anchor
  document.body.append(tour)
  await tour.updateComplete
  return {tour, anchor, root: tour.shadowRoot!}
}

it("walks forwards and backwards, then finishes without changing the document or focus", async () => {
  const {tour, anchor, root} = await mount()
  const dismiss = vi.fn()
  tour.addEventListener("tour-dismiss", dismiss)
  anchor.focus()
  const next = () => root.querySelector<HTMLButtonElement>(".next")!.click()
  const back = () => [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Back")!
  expect(back().disabled).toBe(true)
  expect(root.textContent).toContain("Make it yours")
  next()
  await tour.updateComplete
  expect(root.textContent).toContain("Add something")
  expect(back().disabled).toBe(false)
  back().click()
  await tour.updateComplete
  expect(root.textContent).toContain("Make it yours")
  for(let step = 0; step < 3; step++) { next(); await tour.updateComplete }
  expect(root.textContent).toContain("Keep your work")
  expect(root.querySelector(".next")!.textContent).toContain("Done")
  next()
  expect(dismiss).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(anchor)
  expect(anchor.className).toContain("◆anchor-target-")
  tour.remove()
  expect(anchor.outerHTML).toBe("<button></button>")
})

it("can be dismissed immediately or with Escape", async () => {
  const {tour, root} = await mount()
  const dismiss = vi.fn()
  tour.addEventListener("tour-dismiss", dismiss)
  root.querySelector<HTMLButtonElement>(".close")!.click()
  root.querySelector("section")!.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
  expect(dismiss).toHaveBeenCalledTimes(2)
})

it("uses anchor positioning for the card and target outline without inline coordinates", async () => {
  const {tour, anchor, root} = await mount()
  vi.spyOn(tour, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 272, 140))
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(window.innerWidth - 60, 40, 50, 30))
  root.querySelector<HTMLButtonElement>(".next")!.click()
  await tour.updateComplete
  expect(tour.style.left).toBe("")
  expect(tour.style.top).toBe("")
  expect(root.querySelector<HTMLElement>(".target")!.style.left).toBe("")
  expect(root.querySelector<HTMLElement>(".target")!.style.width).toBe("")
  expect(root.querySelector<HTMLElement>(".target")!.hidden).toBe(false)
  anchor.remove()
  expect(() => window.dispatchEvent(new Event("resize"))).not.toThrow()
})

it("releases resize observation and window listeners on removal", async () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect")
  const remove = vi.spyOn(window, "removeEventListener")
  const {tour} = await mount()
  disconnect.mockClear()
  tour.remove()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function))
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true)
})
