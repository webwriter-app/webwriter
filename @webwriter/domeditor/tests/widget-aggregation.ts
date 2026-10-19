import {LivePreview} from "../src/live-preview"
import {WidgetAggregateViews} from "../src/widget-aggregate-view"
import type {LiveWidgetAggregateInput, WidgetAggregateConfig, WidgetAggregateContext} from "../src/widget-aggregate"

const items = [{id: "a", label: "First computer"}, {id: "b", label: "Compiler"}, {id: "c", label: "Hypertext"}]
const examples: {name: string; config?: WidgetAggregateConfig; values: unknown[]}[] = [
  {name: "Selection", config: {shape: "selection", items, reference: "b"}, values: ["b", "b", "b", "a", "c"]},
  {name: "Ordering", config: {shape: "ordering", items, reference: ["a", "b", "c"]}, values: [["a", "b", "c"], ["a", "c", "b"], ["a", "b", "c"], ["b", "a", "c"], ["a", "b", "c"]]},
  {name: "Number", config: {shape: "number", reference: 3}, values: [3, 3, 3, 2, 4]},
  {name: "Text", config: {shape: "text"}, values: ["The machine accepts the input.", "The last state accepts.", "The machine can dispense a drink.", "Accepting the input.", "I am still working."]},
  {name: "Spatial", config: {shape: "spatial", bounds: {width: 10, height: 6}, reference: [{x: 3, y: 2}, {x: 8, y: 4}]}, values: [[{x: 3, y: 2}, {x: 8, y: 4}], [{x: 3, y: 2}], [{x: 3, y: 2}, {x: 7, y: 3}], [{x: 4, y: 2}], [{x: 8, y: 4}]]},
  {name: "Distance map", config: {shape: "distancemap", reference: [1, 1]}, values: [[1, 1], [1, 1.2], [3, 4], [3.1, 4], [6, 1]]},
  {name: "Custom", config: {shape: "custom", element: "demo-aggregate-summary"}, values: [{accepting: true}, {accepting: true}, {accepting: false}, {accepting: true}, {accepting: false}]},
  {name: "Thumbnail fallback", values: ["a", "b", "b", "c", "b"]},
]
class Summary extends HTMLElement {
  aggregate!: WidgetAggregateContext
  connectedCallback() {
    const accepted = this.aggregate.samples.filter(sample => (sample.value as {accepting: boolean}).accepting).length
    this.textContent = `${accepted} / ${this.aggregate.samples.length} responses mark the final state as accepting.`
    this.style.cssText = "display:grid;place-items:center;min-height:160px;background:#eef7f2;border-radius:6px;padding:20px;font-size:20px;color:#166343"
  }
}
customElements.define("demo-aggregate-summary", Summary)
class ScopedSummary extends Summary {}
const customRegistry = new CustomElementRegistry()
customRegistry.define("demo-aggregate-summary", ScopedSummary)
const inputs: LiveWidgetAggregateInput[] = []
for(const [index, example] of examples.entries()) {
  const name = `demo-aggregate-${index}`
  class Widget extends HTMLElement {
    static aggregate = example.config ? index === 2 ? [{...example.config, title: example.name}, {shape: "text" as const, title: "State descriptions", value: (value: unknown) => String(value)}] : {...example.config, title: example.name} : undefined
    connectedCallback() {
      if(!this.shadowRoot) {
        const shadow = this.attachShadow({mode: "open", ...(index === 6 ? {customElementRegistry: customRegistry} : {})} as ShadowRootInit)
        const content = document.createElement("p")
        content.textContent = `${example.name}: ${this.querySelector("script")?.textContent ?? "Authored widget"}`
        shadow.append(content)
      }
    }
  }
  customElements.define(name, Widget)
  const widget = document.createElement(name)
  widget.id = `widget-${index}`
  const block = document.createElement("script")
  block.type = "application/json"; block.slot = "data"; block.textContent = "{}"
  widget.append(block)
  document.querySelector("main")!.append(widget)
  inputs.push({id: widget.id, path: [1, index], view: "aggregate", participants: example.values.map((value, i) => ({
    id: `learner-${i}`, name: ["Ada", "Grace", "Amira", "Yusuf", "Liam"][i],
    snapshot: {html: `<${name}><script type="application/json" slot="data">${JSON.stringify(value)}</script></${name}>`, data: {status: "ready", mode: "individual", format: "json", text: JSON.stringify(value)}},
  }))})
}
const views = new WidgetAggregateViews(document)
const find = (input: LiveWidgetAggregateInput) => document.getElementById(input.id!)
const authored = document.body.innerHTML
views.update(inputs, find)
const checks: string[] = []
function check(condition: unknown, message: string) {
  if(!condition) throw new Error(message)
  checks.push(message)
}
try {
  const panels = () => document.body.shadowRoot!.querySelector(".◆live-aggregates")!.shadowRoot!
  check(panels().querySelectorAll("section").length === 8, "All seven shapes and fallback render")
  check(document.body.innerHTML === authored, "Authored light DOM is unchanged")
  check(!!document.body.shadowRoot!.querySelector('slot:not([name])'), "Default slot preserves authored layout")
  check(panels().querySelectorAll(".reference").length >= 5, "Reference values are marked")
  check(panels().querySelectorAll("svg circle").length === 5, "Distance map renders every response")
  const dots = [...panels().querySelectorAll("svg circle")]
  const plottedDistance = (i: number, j: number) => Math.hypot(Number(dots[i].getAttribute("cx")) - Number(dots[j].getAttribute("cx")), Number(dots[i].getAttribute("cy")) - Number(dots[j].getAttribute("cy")))
  check(Math.abs(plottedDistance(0, 1) / plottedDistance(0, 2) - 0.2 / Math.hypot(2, 3)) < 0.001, "Distance map keeps a uniform coordinate scale")
  check(panels().querySelectorAll(".target").length === 2, "Spatial reference cells are marked")
  check(panels().querySelector("demo-aggregate-summary") instanceof ScopedSummary, "Custom renderers use the widget's scoped registry")
  inputs[2].aggregateId = "text"
  const choices = views.update(inputs, find)
  check(choices[2].options.length === 2 && choices[2].selectedId === "text" && panels().querySelectorAll("section")[2].textContent?.includes("State descriptions"), "One widget switches between multiple declared shapes")
  delete inputs[2].aggregateId
  views.update(inputs, find)
  const narrowed = [{...inputs[0], participants: inputs[0].participants.slice(0, 1)}]
  views.update(narrowed, find)
  check(panels().querySelectorAll("section").length === 1 && panels().textContent!.includes("1 independent responses"), "Learner filters replace aggregate samples")
  views.update([{...inputs[0], view: "individual"}], find)
  check(!document.body.shadowRoot!.querySelector(".◆live-aggregates"), "Individual view removes aggregate UI")
  // Exercise the real capture/runtime contract in a separate document frame.
  const frame = document.createElement("iframe")
  frame.hidden = true
  document.body.append(frame)
  const root = frame.contentDocument!
  root.body.innerHTML = '<demo-quiz id="quiz"><script type="application/json" slot="data">{"choice":"a"}</script></demo-quiz>'
  const preview = new LivePreview()
  const steps: unknown[] = []
  preview.observeLearner(frame, root, step => steps.push(step))
  const block = root.querySelector("script")!
  block.textContent = '{"choice":"b"}'
  block.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode: "group", scopeId: "group-a"}}))
  await Promise.resolve()
  const data = preview.captureWidgetStates(root)[0].data
  check(data?.status === "ready" && data.scopeId === "group-a" && steps.length > 1, "Accepted remote data is captured without input events")
  preview.disconnect()
  frame.remove()
  views.update(inputs, find)
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const visible = [...panels().querySelectorAll<HTMLElement>("section")].filter(panel => !panel.hidden)
  check(visible.every(panel => panel.getBoundingClientRect().left >= 0 && panel.getBoundingClientRect().right <= innerWidth), "Visible panels stay within the actual viewport")
  document.getElementById("checks")!.textContent = `Passed ${checks.length} browser checks.`
  ;(window as Window & {aggregateChecks?: unknown}).aggregateChecks = checks
  if(new URL(location.href).searchParams.has("run")) await fetch("/__native-result", {method: "POST", body: JSON.stringify({checks: checks.map(name => ({name}))})})
}
catch(error) {
  document.getElementById("checks")!.textContent = `FAILED: ${error instanceof Error ? error.message : error}`
  if(new URL(location.href).searchParams.has("run")) await fetch("/__native-result", {method: "POST", body: JSON.stringify({error: String(error), checks: checks.map(name => ({name}))})})
  throw error
}
