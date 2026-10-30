// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {WidgetAggregateViews} from "./widget-aggregate-view"
import type {LiveWidgetAggregateInput, WidgetAggregateContext, WidgetDataSnapshot} from "./widget-aggregate"
import {clearEditorMarkerClasses} from "./editor-artifacts"

const items = [{id: "a", label: "Alpha"}, {id: "b", label: "Beta"}]
class SelectionWidget extends HTMLElement {
  static aggregate = {shape: "selection", title: "Selections", items, reference: "b", value: (data: any) => data.choice}
}
class OrderingWidget extends HTMLElement {
  static aggregate = {shape: "ordering", items, reference: ["b", "a"]}
}
class NumberWidget extends HTMLElement {
  static aggregate = {shape: "number", reference: 2}
}
class TextWidget extends HTMLElement {
  static aggregate = {shape: "text"}
}
class SpatialWidget extends HTMLElement {
  static aggregate = {shape: "spatial", bounds: {width: 10, height: 10}, columns: 2, rows: 2, reference: {x: 1, y: 1}}
}
class DistanceWidget extends HTMLElement {
  static aggregate = {shape: "distancemap", reference: [0]}
}
class CustomRenderer extends HTMLElement {
  aggregate?: WidgetAggregateContext
  connectedContext?: WidgetAggregateContext
  connectedCallback() { this.connectedContext = this.aggregate }
}
class CustomWidget extends HTMLElement {
  static aggregate = {shape: "custom", element: "demo-aggregate-custom-renderer"}
}
class UnknownWidget extends HTMLElement {
  static aggregate = {shape: "unsupported"}
}
class ThrowingWidget extends HTMLElement {
  static aggregate = () => { throw new Error("bad declaration") }
}

for(const [name, constructor] of [
  ["demo-aggregate-selection", SelectionWidget],
  ["demo-aggregate-ordering", OrderingWidget],
  ["demo-aggregate-number", NumberWidget],
  ["demo-aggregate-text", TextWidget],
  ["demo-aggregate-spatial", SpatialWidget],
  ["demo-aggregate-distance", DistanceWidget],
  ["demo-aggregate-custom", CustomWidget],
  ["demo-aggregate-custom-renderer", CustomRenderer],
  ["demo-aggregate-unknown", UnknownWidget],
  ["demo-aggregate-throwing", ThrowingWidget],
] as const) customElements.define(name, constructor)

const activeViews: WidgetAggregateViews[] = []
afterEach(() => {
  for(const views of activeViews.splice(0)) views.destroy()
  document.body.innerHTML = ""
  document.body.shadowRoot?.replaceChildren()
})

function ready(value: unknown, format: WidgetDataSnapshot["format"] = "json", mode: WidgetDataSnapshot["mode"] = "individual"): WidgetDataSnapshot {
  return {status: "ready", format, mode, text: format === "json" ? JSON.stringify(value) : String(value)}
}
function input(view: LiveWidgetAggregateInput["view"], participants: LiveWidgetAggregateInput["participants"]): LiveWidgetAggregateInput {
  return {path: [0], view, participants}
}
function participant(id: string, value: unknown, name = id, format: WidgetDataSnapshot["format"] = "json") {
  return {id, name, snapshot: {data: ready(value, format)}}
}
function show(tag: string, data: unknown[], view: LiveWidgetAggregateInput["view"] = "aggregate", format: WidgetDataSnapshot["format"] = "json") {
  document.body.innerHTML = `<${tag} id="target"><strong>authored content</strong></${tag}>`
  const widget = document.querySelector(tag)!
  const views = new WidgetAggregateViews(document)
  activeViews.push(views)
  const people = data.map((value, index) => participant(`p${index + 1}`, value, `Learner ${index + 1}`, format))
  views.update([input(view, people)], () => widget)
  const layer = document.body.shadowRoot!.querySelector<HTMLElement>(".◆live-aggregates")!
  return {widget, views, people, layer, panel: layer.shadowRoot!.querySelector<HTMLElement>("section")!}
}

describe("live widget aggregate views", () => {
  it("switches multiple named aggregates and retains choices in individual and thumbnail views", () => {
    class MultiWidget extends HTMLElement {
      static aggregate = [{shape: "number", id: "count", title: "Count"}, {shape: "text", id: "explanation", title: "Explanation"}]
    }
    customElements.define("demo-aggregate-multiple", MultiWidget)
    const {views, widget, panel, people} = show("demo-aggregate-multiple", [2])
    expect(panel.textContent).toContain("Count")
    const update = {...input("aggregate", [participant("a", "Hello")]), aggregateId: "explanation"}
    const choices = views.update([update], () => widget)
    expect(choices[0].selectedId).toBe("explanation")
    expect(panel.textContent).toContain("Hello")
    expect(views.update([{...update, view: "thumbnails"}], () => widget)[0].options).toHaveLength(2)
    expect(views.update([{...input("individual", people), aggregateId: "count"}], () => widget)[0].selectedId).toBe("count")
    expect(document.body.shadowRoot?.querySelector(".◆live-aggregates")).toBeNull()
  })

  it("re-evaluates authored configuration while response inputs stay unchanged", () => {
    class AuthoredWidget extends HTMLElement {
      static aggregate = (context: WidgetAggregateContext) => [{shape: "text", title: context.widget.attributes.title}]
    }
    customElements.define("demo-aggregate-authored", AuthoredWidget)
    const {views, widget, panel, people} = show("demo-aggregate-authored", ["Answer"])
    widget.setAttribute("title", "Updated view")
    views.update([input("aggregate", people)], () => widget)
    expect(panel.querySelector("h3")?.textContent).toBe("Updated view")
  })

  it("renders selection counts and marks the explicit reference", () => {
    const {panel} = show("demo-aggregate-selection", [{choice: "a"}, {choice: "b"}, {choice: "a"}])
    const rows = [...panel.querySelectorAll(".row")]
    expect(rows.map(row => row.textContent)).toEqual(["Alpha2", "Beta ✓1"])
    expect(rows[1].querySelector(".reference")).not.toBeNull()
  })

  it("renders ordering frequencies and reference cells", () => {
    const {panel} = show("demo-aggregate-ordering", [["b", "a"], ["a", "b"], ["b", "a"]])
    expect(panel.querySelectorAll("table tr")).toHaveLength(3)
    expect([...panel.querySelectorAll("table tr:nth-child(2) td")].map(cell => cell.textContent)).toEqual(["1", "2"])
    expect(panel.querySelectorAll("td.reference")).toHaveLength(2)
  })

  it("renders finite number counts and the reference statistic", () => {
    const {panel} = show("demo-aggregate-number", [1, 2, 2, 3])
    expect(panel.textContent).toContain("Median 2")
    expect(panel.querySelectorAll(".row")).toHaveLength(3)
    expect(panel.querySelector(".row .reference")).not.toBeNull()
  })

  it("shows text responses and word frequencies", () => {
    const {panel} = show("demo-aggregate-text", ["Hello hello world", "hello there"])
    expect([...panel.querySelectorAll(".row")].map(row => row.textContent)).toEqual(["hello3", "there1", "world1"])
    expect(panel.querySelector("ul")?.textContent).toContain("Learner 1: Hello hello world")
  })

  it("renders spatial density cells and outlines the reference cell", () => {
    const {panel} = show("demo-aggregate-spatial", [{x: 1, y: 1}, [{x: 1, y: 1}, {x: 9, y: 9}], {x: 9, y: 9}])
    const cells = [...panel.querySelectorAll<HTMLElement>(".density span")]
    expect(cells).toHaveLength(4)
    expect(cells[0].title).toContain(": 2 responses")
    expect(cells[3].title).toContain(": 2 responses")
    expect(cells[0].className).toBe("target")
  })

  it("plots distance map points from numeric feature vectors", () => {
    const {panel} = show("demo-aggregate-distance", [[0], [1], [3]])
    const points = [...panel.querySelectorAll("svg circle")]
    expect(points).toHaveLength(3)
    expect(points.every(point => Number.isFinite(Number(point.getAttribute("cx"))) && Number.isFinite(Number(point.getAttribute("cy"))))).toBe(true)
    expect(points.map(point => point.querySelector("title")?.textContent)).toEqual(["Learner 1", "Learner 2", "Learner 3"])
  })

  it("passes a frozen context to a registered custom renderer", () => {
    const {panel} = show("demo-aggregate-custom", [{choice: "a"}])
    const renderer = panel.querySelector("demo-aggregate-custom-renderer") as CustomRenderer
    expect(renderer).not.toBeNull()
    expect(renderer.connectedContext?.samples[0].value).toEqual({choice: "a"})
    expect(Object.isFrozen(renderer.connectedContext)).toBe(true)
    expect(Object.isFrozen(renderer.connectedContext?.samples[0].value)).toBe(true)
  })

  it.each(["demo-aggregate-unknown", "demo-aggregate-throwing"])("falls back to learner thumbnails for %s", tag => {
    const {panel} = show(tag, [{choice: "a"}])
    expect(panel.querySelector("h3")?.textContent).toBe("Learner snapshots")
    expect(panel.textContent).toContain("Learner 1")
  })

  it("renders XML snapshots through an explicit extractor", () => {
    class XmlTextWidget extends HTMLElement {
      static aggregate = {shape: "text", value: (data: unknown) => String(data).match(/<answer>(.*?)<\/answer>/)?.[1] ?? ""}
    }
    customElements.define("demo-aggregate-xml", XmlTextWidget)
    const {panel} = show("demo-aggregate-xml", ["<answer>XML answer</answer>"], "aggregate", "xml")
    expect(panel.textContent).toContain("XML answer")
  })

  it("honors the selected view and updates participant filters and replayed snapshots", () => {
    document.body.innerHTML = '<demo-aggregate-text id="target"><b>authored</b></demo-aggregate-text>'
    const widget = document.querySelector("demo-aggregate-text")!
    const views = new WidgetAggregateViews(document)
    activeViews.push(views)
    const first = input("thumbnails", [participant("a", "old"), participant("b", "hidden")])
    views.update([first], () => widget)
    const layer = document.body.shadowRoot!.querySelector<HTMLElement>(".◆live-aggregates")!
    const panel = () => layer.shadowRoot!.querySelector<HTMLElement>("section")!
    expect(panel().querySelectorAll("figure")).toHaveLength(2)

    const filtered = input("thumbnails", [participant("a", "replayed")])
    views.update([filtered], () => widget)
    expect(panel().querySelectorAll("figure")).toHaveLength(1)
    expect(panel().textContent).toContain("replayed")

    views.update([input("individual", [participant("a", "replayed")])], () => widget)
    expect(document.body.shadowRoot!.querySelector(".◆live-aggregates")).toBeNull()
    expect(document.body.innerHTML).toBe('<demo-aggregate-text id="target"><b>authored</b></demo-aggregate-text>')
  })

  it("keeps the appendix slot and existing shadow content while cleaning up its layer", () => {
    const authoredHTML = '<demo-aggregate-text id="target"><b>authored</b></demo-aggregate-text>'
    document.body.innerHTML = authoredHTML
    const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    appendix.replaceChildren()
    const existing = document.createElement("aside")
    existing.textContent = "other appendix content"
    appendix.append(existing)
    const widget = document.querySelector("demo-aggregate-text")!
    const views = new WidgetAggregateViews(document)
    activeViews.push(views)
    views.update([input("aggregate", [participant("a", "answer")])], () => widget)
    expect(appendix.querySelector("slot:not([name])")).not.toBeNull()
    expect(existing.isConnected).toBe(true)
    const serialized = document.body.cloneNode(true) as HTMLElement
    clearEditorMarkerClasses(serialized)
    expect(serialized.innerHTML).toBe(authoredHTML)
    expect(appendix.querySelector(".◆live-aggregates")).not.toBeNull()

    views.destroy()
    expect(appendix.querySelector(".◆live-aggregates")).toBeNull()
    expect(appendix.querySelector("slot:not([name])")).not.toBeNull()
    expect(existing.isConnected).toBe(true)
    expect(document.body.innerHTML).toBe(authoredHTML)
  })

  it("anchors panels with CSS without writing geometry to authored widgets", () => {
    const {widget, views, panel} = show("demo-aggregate-text", ["answer"])
    const serialized = widget.cloneNode(true) as Element
    clearEditorMarkerClasses(serialized)
    const authored = serialized.outerHTML
    expect(panel.style.cssText).toBe("")
    const current = widget.cloneNode(true) as Element
    clearEditorMarkerClasses(current)
    expect(current.outerHTML).toBe(authored)
    expect(widget.className).toContain("◆anchor-target-")
    expect(panel.getAttribute("part")).toContain("anchor-control-")

    const serializedAgain = widget.cloneNode(true) as Element
    clearEditorMarkerClasses(serializedAgain)
    expect(serializedAgain.outerHTML).toBe(authored)

    views.destroy()
    expect(widget.className).toBe("")
    expect(widget.outerHTML).toBe(authored)
  })

  it("rebinds a panel when the live target is replaced and clears both targets on teardown", () => {
    document.body.innerHTML = '<demo-aggregate-text id="first"><b>first</b></demo-aggregate-text><demo-aggregate-text id="second"><b>second</b></demo-aggregate-text>'
    const [first, second] = [...document.querySelectorAll("demo-aggregate-text")]
    const views = new WidgetAggregateViews(document)
    activeViews.push(views)
    const people = [participant("p1", "answer")]
    const inputs = [input("aggregate", people)]
    views.update(inputs, () => first)
    const oldPanel = document.body.shadowRoot!.querySelector(".◆live-aggregates")!.shadowRoot!.querySelector("section")
    expect(first.className).toContain("◆anchor-target-")

    views.update(inputs, () => second)
    const newPanel = document.body.shadowRoot!.querySelector(".◆live-aggregates")!.shadowRoot!.querySelector("section")
    expect(newPanel).not.toBe(oldPanel)
    expect(first.className).toBe("")
    expect(second.className).toContain("◆anchor-target-")

    views.destroy()
    expect(first.className).toBe("")
    expect(second.className).toBe("")
    expect(first.outerHTML).toBe('<demo-aggregate-text id="first"><b>first</b></demo-aggregate-text>')
    expect(second.outerHTML).toBe('<demo-aggregate-text id="second"><b>second</b></demo-aggregate-text>')
  })
})
