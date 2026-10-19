// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {LiveSessionOverlay, type LiveSessionLearner, type LiveSessionWidget} from "./live-session-overlay"

afterEach(() => document.body.replaceChildren())

describe("live session overlay", () => {
  it("exposes named aggregate choices independently of learner selection", async () => {
    const overlay = new LiveSessionOverlay()
    overlay.widgets = [{path: "[0]", x: .5, y: .2, learners: [{id: "ada", name: "Ada", color: "blue"}],
      aggregateOptions: [{id: "count", title: "State count"}, {id: "text", title: "Explanations"}], selectedAggregateId: "text"}]
    document.body.append(overlay)
    await overlay.updateComplete
    const select = overlay.shadowRoot!.querySelector("select")!
    expect(select.value).toBe("@aggregate:text")
    expect([...select.options].map(option => option.textContent)).toEqual(["State count", "Explanations", "Thumbnail wall", "Ada"])
    let detail: unknown
    overlay.addEventListener("live-widget-state-change", event => { detail = (event as CustomEvent).detail })
    select.value = "@aggregate:count"
    select.dispatchEvent(new Event("change"))
    expect(detail).toEqual({path: "[0]", learnerId: null, view: "aggregate", aggregateId: "count"})
  })

  it("renders combined learner overlays and widget state affordances", async () => {
    const overlay = new LiveSessionOverlay()
    const learners: LiveSessionLearner[] = [{
      id: "ada",
      name: "Ada Lovelace",
      color: "#e11d48",
      cursor: {x: 0.25, y: 0.4},
      scroll: 0.7,
      regions: [{x: 0.1, y: 0.2, width: 0.3, height: 0.15}],
      click: {x: 0.25, y: 0.4, sequence: 1},
    }, {
      id: "grace",
      name: "Grace Hopper",
      initials: "GH",
      color: "#2563eb",
      cursor: {x: 0.8, y: 0.2},
    }]
    const widgets: LiveSessionWidget[] = [{
      path: "body/0/1",
      x: 0.5,
      y: 0.6,
      learners: [
        {id: "ada", name: "Ada Lovelace", color: "#e11d48"},
        {id: "grace", name: "Grace Hopper", color: "#2563eb"},
      ],
    }]
    overlay.learners = learners
    overlay.widgets = widgets
    document.body.append(overlay)
    await overlay.updateComplete

    expect(overlay.shadowRoot!.querySelectorAll(".state-region")).toHaveLength(1)
    expect(overlay.shadowRoot!.querySelectorAll(".cursor")).toHaveLength(2)
    expect(overlay.shadowRoot!.querySelectorAll(".click-ring")).toHaveLength(1)
    expect(overlay.shadowRoot!.querySelectorAll(".scroll-marker")).toHaveLength(1)
    expect(overlay.shadowRoot!.querySelectorAll(".widget-affordance")).toHaveLength(1)
    expect(overlay.shadowRoot!.querySelector<HTMLElement>(".cursor")?.style.left).toBe("25%")
    expect(overlay.shadowRoot!.querySelector<HTMLElement>(".scroll-marker")?.style.top).toBe("70%")
    expect(overlay.shadowRoot!.querySelector(".cursor-label")?.textContent).toBe("AL")
    expect(overlay.shadowRoot!.querySelector(".overlay")?.getAttribute("role")).toBe("group")
    expect(overlay.shadowRoot!.querySelector(".cursor")?.getAttribute("role")).toBe("img")
    expect(overlay.shadowRoot!.querySelector(".cursor")?.getAttribute("aria-label")).toBe("Ada Lovelace cursor")
  })

  it("dispatches widget learner selection without touching authored DOM", async () => {
    const overlay = new LiveSessionOverlay()
    overlay.widgets = [{
      path: "body/2",
      x: 0.2,
      y: 0.3,
      selectedLearnerId: "ada",
      learners: [{id: "ada", name: "Ada", color: "#e11d48"}],
    }]
    const host = document.createElement("p")
    host.textContent = "Authored content"
    host.append(overlay)
    document.body.append(host)
    await overlay.updateComplete

    let detail: {path: string; learnerId: string | null} | undefined
    overlay.addEventListener("live-widget-state-change", event => {
      detail = (event as CustomEvent<{path: string; learnerId: string | null}>).detail
    })
    const select = overlay.shadowRoot!.querySelector<HTMLSelectElement>("select")!
    select.value = ""
    select.dispatchEvent(new Event("change", {bubbles: true}))

    expect(detail).toEqual({path: "body/2", learnerId: null})
    expect(host.textContent).toBe("Authored content")
    expect(host.querySelector(".state-region")).toBeNull()
  })

  it("selects the thumbnail wall and reports a null learner ID with its view", async () => {
    const overlay = new LiveSessionOverlay()
    overlay.widgets = [{
      path: "body/3",
      x: 0.4,
      y: 0.5,
      view: "thumbnails",
      learners: [{id: "ada", name: "Ada", color: "#e11d48"}],
    }]
    document.body.append(overlay)
    await overlay.updateComplete

    const select = overlay.shadowRoot!.querySelector<HTMLSelectElement>("select")!
    expect(select.value).toBe("@thumbnails")
    let detail: {path: string; learnerId: string | null; view?: string} | undefined
    overlay.addEventListener("live-widget-state-change", event => {
      detail = (event as CustomEvent<{path: string; learnerId: string | null; view?: string}>).detail
    })
    select.dispatchEvent(new Event("change", {bubbles: true}))

    expect(detail).toEqual({path: "body/3", learnerId: null, view: "thumbnails"})
  })

  it("restarts the click animation for each learner click", async () => {
    const overlay = new LiveSessionOverlay()
    const learner = {
      id: "ada",
      name: "Ada",
      color: "#e11d48",
      click: {x: 0.2, y: 0.3, sequence: "click-1"},
    }
    overlay.learners = [learner]
    document.body.append(overlay)
    await overlay.updateComplete
    const firstRing = overlay.shadowRoot!.querySelector(".click-ring")

    overlay.learners = [{...learner, click: {...learner.click, sequence: "click-2"}}]
    await overlay.updateComplete

    expect(overlay.shadowRoot!.querySelector(".click-ring")).not.toBe(firstRing)
  })

  it("renders a combined visualization for 100 learners", async () => {
    const overlay = new LiveSessionOverlay()
    overlay.learners = Array.from({length: 100}, (_, index) => ({
      id: `learner-${index}`,
      name: `Learner ${index}`,
      color: `hsl(${index * 3.6} 70% 45%)`,
      cursor: {x: (index % 10) / 10, y: Math.floor(index / 10) / 10},
      scroll: index / 99,
    }))
    document.body.append(overlay)
    await overlay.updateComplete

    expect(overlay.shadowRoot!.querySelectorAll(".cursor")).toHaveLength(100)
    expect(overlay.shadowRoot!.querySelectorAll(".scroll-marker")).toHaveLength(100)
  })

  it("keeps untrusted learner colors inside the CSS color property", async () => {
    const overlay = new LiveSessionOverlay()
    overlay.learners = [{
      id: "learner-1",
      name: "Learner",
      color: "red; background-image: url(https://attacker.test/pixel)",
      cursor: {x: 0.25, y: 0.5},
    }]
    document.body.append(overlay)
    await overlay.updateComplete

    const cursor = overlay.shadowRoot!.querySelector<HTMLElement>(".cursor")!
    expect(cursor.style.getPropertyValue("--learner-color")).toBe("#64748b")
    expect(cursor.style.backgroundImage).toBe("")
  })
})
