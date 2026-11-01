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
  tour.packages = [
    {name: "@webwriter/quiz", label: "Quiz", iconUrl: "https://example.test/quiz.svg"},
    {name: "@webwriter/slides", label: "Slides", iconUrl: "https://example.test/slides.svg"},
    {name: "@webwriter/map", label: "Map", iconUrl: "https://example.test/map.svg"},
    {name: "@webwriter/timeline", label: "Timeline", iconUrl: "https://example.test/timeline.svg"},
    {name: "@webwriter/graph", label: "Graph", iconUrl: "https://example.test/graph.svg"},
  ] as GuidedTour["packages"]
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
  expect(root.textContent).toContain("Content")
  expect(root.querySelector(".demo ribbon-drawer")).toBeNull()
  next()
  await tour.updateComplete
  expect(root.textContent).toContain("Formatting")
  expect(back().disabled).toBe(false)
  back().click()
  await tour.updateComplete
  expect(root.textContent).toContain("Content")
  for(const title of ["Formatting", "Elements", "Widgets", "Edit", "Ask AI", "Review", "Distribute", "Layouts"]) {
    next(); await tour.updateComplete
    expect(root.querySelector("h2")!.textContent).toBe(title)
    expect(root.querySelector(".demo")!.children.length).toBeGreaterThan(0)
    const drawers = [...root.querySelectorAll<HTMLElement>(".demo ribbon-drawer")]
    if(title === "Layouts") {
      expect(root.querySelectorAll(".layouts-cards .document-layout-preview")).toHaveLength(4)
    }
    if(title === "Edit") {
      expect(root.querySelector(".pane-title")!.textContent).toContain("Heading")
      expect(root.querySelectorAll(".heading-choice")).toHaveLength(6)
    }
    if(title === "Widgets") {
      expect(root.querySelector(".quiz-question")!.textContent).toBe("What is 2 + 2?")
      expect(root.querySelectorAll(".quiz-option")).toHaveLength(2)
      const buttons = root.querySelectorAll<HTMLElement>('ribbon-drawer[label="Packages"] ribbon-button')
      expect(Array.from(buttons, button => button.getAttribute("label"))).toEqual(["Quiz", "Slides", "Map", "Timeline", "Graph"])
      expect((buttons[0] as any).iconUrl).toBe("https://example.test/quiz.svg")
      const searches = root.querySelectorAll<HTMLElement>("package-search")
      expect(Array.from(searches, search => search.getAttribute("query") ?? "")).toEqual(["", "q", "qu", "qui", "quiz"])
    }
    if(["Edit", "Ask AI", "Review", "Distribute", "Layouts"].includes(title)) {
      expect(drawers).toHaveLength(0)
      expect(root.querySelectorAll(".mock-tab")).toHaveLength(5)
      const active = root.querySelector<HTMLElement>(".mock-tab.active")
      expect(active?.dataset.tool ?? null).toBe(({Edit: "Edit", "Ask AI": "AI", Review: "Review", Distribute: "Distribute"} as Record<string, string>)[title] ?? null)
      if(active) {
        expect(active.querySelector(".mock-tab-label")!.textContent).toBe(title === "Edit" ? "Heading" : title)
        expect(active.querySelector(".mock-tab-close")).not.toBeNull()
      }
    }
    if(drawers.length) {
      const expanded = ({Formatting: "Marks", Elements: "Elements", Widgets: "Packages"} as Record<string, string>)[title]
      expect(drawers.filter(drawer => !drawer.hasAttribute("collapsed")).map(drawer => drawer.getAttribute("label")))
        .toEqual(expanded ? [expanded] : [])
    }
  }
  expect(root.querySelector(".progress")!.getAttribute("aria-label")).toBe("Step 9 of 9")
  expect(root.textContent).toContain("Make any kind of content.")
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

it("animates between step positions and cancels the motion on removal", async () => {
  const {tour, root} = await mount()
  const cancel = vi.fn()
  const animate = vi.fn().mockReturnValue({cancel})
  Object.defineProperty(tour, "animate", {value: animate, configurable: true})
  vi.spyOn(tour, "getBoundingClientRect")
    .mockReturnValueOnce(new DOMRect(10, 20, 272, 200))
    .mockReturnValueOnce(new DOMRect(110, 70, 272, 200))
  root.querySelector<HTMLButtonElement>(".next")!.click()
  await tour.updateComplete
  expect(animate).toHaveBeenCalledWith([
    {transform: "translate(-100px, -50px)"},
    {transform: "translate(0, 0)"},
  ], {duration: 240, easing: "ease-out"})
  tour.remove()
  expect(cancel).toHaveBeenCalledOnce()
})

it("does not animate step movement when UI motion is disabled", async () => {
  const {tour, root} = await mount()
  tour.style.setProperty("--ww-ui-transition", "none")
  const animate = vi.fn()
  Object.defineProperty(tour, "animate", {value: animate, configurable: true})
  vi.spyOn(tour, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 272, 200))
  root.querySelector<HTMLButtonElement>(".next")!.click()
  await tour.updateComplete
  expect(animate).not.toHaveBeenCalled()
})


it("does not fabricate a quiz when the catalog has no quiz package", async () => {
  const {tour, root} = await mount()
  tour.packages = []
  await tour.updateComplete
  for(let step = 0; step < 3; step++) {
    root.querySelector<HTMLButtonElement>(".next")!.click()
    await tour.updateComplete
  }
  expect(root.textContent).toContain("Quiz package unavailable")
  expect(root.querySelector(".widget-result")).toBeNull()
})
