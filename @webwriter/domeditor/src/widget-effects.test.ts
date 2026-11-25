// @vitest-environment happy-dom
import {Signal} from "signal-polyfill"
import {afterEach, expect, it, vi} from "vitest"
import {effectAccepts, inspectWidgetEffects, isWidgetHost, mountWidgetEffects, parseWidgetEffectReference, validateWidgetEffect, widgetEffectReference, widgetSignalDeclarations, type WidgetSignal} from "./widget-effects"

const settle = () => new Promise(resolve => setTimeout(resolve))

class ReactiveSource extends HTMLElement {
  value = new Signal.State(2)
  signals = {value: new Signal.Computed(() => this.value.get())}
}
customElements.define("reactive-source", ReactiveSource)

class ReactiveTransform extends HTMLElement {
  static effects = {
    left: {connect(this: ReactiveTransform, source: WidgetSignal, lifetime: AbortSignal) { this.bind(this.left, source, lifetime) }},
    right: {connect(this: ReactiveTransform, source: WidgetSignal, lifetime: AbortSignal) { this.bind(this.right, source, lifetime) }},
  }
  left = new Signal.State<WidgetSignal | null>(null)
  right = new Signal.State<WidgetSignal | null>(null)
  binds = 0
  signals = {
    total: new Signal.Computed(() => Number(this.left.get()?.get() ?? 0) + Number(this.right.get()?.get() ?? 0)),
  }
  bind(input: Signal.State<WidgetSignal | null>, source: WidgetSignal, lifetime: AbortSignal) {
    this.binds++
    input.set(source)
    lifetime.addEventListener("abort", () => input.set(null), {once: true})
  }
}
customElements.define("reactive-transform", ReactiveTransform)

class ReactiveDisplay extends HTMLElement {
  static effects = {
    effect: {connect(this: ReactiveDisplay, source: Signal.Computed<number>, lifetime: AbortSignal) {
      const render = () => {
        if(lifetime.aborted) return
        this.values.push(source.get())
        watcher.watch()
      }
      const watcher = new Signal.subtle.Watcher(() => queueMicrotask(render))
      watcher.watch(source)
      queueMicrotask(render)
      lifetime.addEventListener("abort", () => watcher.unwatch(source), {once: true})
    }},
  }
  values: number[] = []
}
customElements.define("reactive-display", ReactiveDisplay)

let runtime: ReturnType<typeof mountWidgetEffects> | undefined
afterEach(() => {
  runtime?.destroy()
  runtime = undefined
  document.body.replaceChildren()
})

it("accepts only a CSS ID plus an attribute presence selector and decodes escapes", () => {
  expect(parseWidgetEffectReference("#\\31 meter[ celsius ]")).toMatchObject({id: "1meter", name: "celsius"})
  expect(parseWidgetEffectReference(widgetEffectReference("sensor:one", "read[ing]"))).toMatchObject({id: "sensor:one", name: "read[ing]"})
  for(const value of ["#123[celsius]", "#sensor [celsius]", "#sensor[celsius=yes]", "#sensor[celsius][other]", "#sensor[celsius], #other[kelvin]"]) {
    expect(parseWidgetEffectReference(value), value).toBeUndefined()
  }
})

it("uses the polyfill to propagate batched changes through two declared inputs and a transitive link", async () => {
  document.body.innerHTML = `
    <section><reactive-source id="source"></reactive-source></section>
    <reactive-transform id="sum" left="#source[value]" right="#source[value]"></reactive-transform>
    <reactive-display effect="#sum[total]"></reactive-display>`
  const source = document.getElementById("source") as ReactiveSource
  const sum = document.getElementById("sum") as ReactiveTransform
  const display = document.querySelector("reactive-display") as ReactiveDisplay
  runtime = mountWidgetEffects(document.body)
  await settle()
  expect(display.values).toEqual([4])
  source.value.set(3)
  source.value.set(5)
  await settle()
  expect(display.values).toEqual([4, 10])
  expect(sum.binds).toBe(2)

  sum.removeAttribute("right")
  await vi.waitFor(() => expect(display.values.at(-1)).toBe(5))
  expect(sum.binds).toBe(2)
  display.remove()
  await settle()
  source.value.set(9)
  await settle()
  expect(display.values).toEqual([4, 10, 5])
})

it("suspends all links in a cycle, retains authored markup and reconnects when the cycle is broken", async () => {
  document.body.innerHTML = `
    <reactive-source id="source"></reactive-source>
    <reactive-transform id="a" left="#source[value]"></reactive-transform>
    <reactive-transform id="b" left="#a[total]"></reactive-transform>
    <reactive-display effect="#b[total]"></reactive-display>`
  const a = document.getElementById("a") as ReactiveTransform
  const b = document.getElementById("b") as ReactiveTransform
  const display = document.querySelector("reactive-display") as ReactiveDisplay
  runtime = mountWidgetEffects(document.body)
  expect(validateWidgetEffect(document.body, a, "right", "#b[total]", () => true)).toBe("Circular signal connection: a → b → a")
  expect(validateWidgetEffect(document.body, a, "right", "#a[total]", () => true)).toBe("Circular signal connection: a → a")
  a.setAttribute("right", "#b[total]")
  await vi.waitFor(() => expect(display.values.at(-1)).toBe(0))
  expect(a.left.get()).not.toBeNull()
  expect(a.right.get()).toBeNull()
  expect(b.left.get()).toBeNull()
  expect(a.getAttribute("right")).toBe("#b[total]")
  a.removeAttribute("right")
  await vi.waitFor(() => expect(display.values.at(-1)).toBe(2))
})

it("resolves late definitions and disconnects when a source ID becomes ambiguous", async () => {
  document.body.innerHTML = `
    <reactive-late-source id="source"></reactive-late-source>
    <reactive-transform id="sum" left="#source[value]"></reactive-transform>`
  const sum = document.getElementById("sum") as ReactiveTransform
  runtime = mountWidgetEffects(document.body)
  expect(sum.left.get()).toBeNull()
  customElements.define("reactive-late-source", class extends ReactiveSource {})
  await vi.waitFor(() => expect(sum.signals.total.get()).toBe(2))
  const duplicate = document.createElement("span")
  duplicate.id = "source"
  document.body.prepend(duplicate)
  await vi.waitFor(() => expect(sum.left.get()).toBeNull())
  duplicate.remove()
  await vi.waitFor(() => expect(sum.signals.total.get()).toBe(2))
  expect(sum.getAttribute("left")).toBe("#source[value]")
})

it("re-reads the links only for content that can change them", async () => {
  document.body.innerHTML = `
    <reactive-source id="source"></reactive-source>
    <reactive-transform id="sum" left="#source[value]"></reactive-transform>
    <p>Text</p>`
  const sum = document.getElementById("sum") as ReactiveTransform
  const onChange = vi.fn()
  runtime = mountWidgetEffects(document.body, {onChange})
  await settle()
  expect(sum.signals.total.get()).toBe(2)
  onChange.mockClear()

  // Ordinary editing: new blocks, inline formatting and their removal.
  const paragraph = document.createElement("p")
  paragraph.innerHTML = "More <em>text</em>"
  document.querySelector("p")!.after(paragraph, document.createElement("hr"))
  await settle()
  paragraph.querySelector("em")!.remove()
  paragraph.remove()
  await settle()
  expect(onChange).not.toHaveBeenCalled()
  expect(sum.signals.total.get()).toBe(2)

  // A wrapper without an ID of its own that brings a duplicate ID.
  const wrapper = document.createElement("section")
  wrapper.innerHTML = '<div><span id="source"></span></div>'
  document.body.append(wrapper)
  await vi.waitFor(() => expect(sum.left.get()).toBeNull())
  expect(onChange).toHaveBeenCalledTimes(1)
  wrapper.remove()
  await vi.waitFor(() => expect(sum.signals.total.get()).toBe(2))

  // A wrapper that brings a widget, and the removal of a wrapped source.
  const nested = document.createElement("section")
  nested.innerHTML = '<div><reactive-display effect="#sum[total]"></reactive-display></div>'
  document.body.append(nested)
  const display = nested.querySelector("reactive-display") as ReactiveDisplay
  await vi.waitFor(() => expect(display.values).toEqual([2]))
  const holder = document.createElement("div")
  document.querySelector("reactive-source")!.replaceWith(holder)
  await vi.waitFor(() => expect(sum.left.get()).toBeNull())
})

class TableSource extends HTMLElement {
  static signals = {history: {shape: "table", label: "History"}, level: {shape: "number"}}
  signals = {history: new Signal.Computed(() => ({columns: ["a"], rows: [[1]]})), level: new Signal.Computed(() => 1), loose: new Signal.Computed(() => 0)}
}
customElements.define("table-source", TableSource)

class TableReader extends HTMLElement {
  static effects = {"data-from": {accepts: ["table"], connect(this: TableReader, source: WidgetSignal, lifetime: AbortSignal) {
    this.sources.push(source)
    lifetime.addEventListener("abort", () => this.sources.pop(), {once: true})
  }}}
  sources: WidgetSignal[] = []
}
customElements.define("table-reader", TableReader)

it("lists and connects only sources whose declared shape an effect accepts", async () => {
  document.body.innerHTML = `
    <table-source id="t"></table-source>
    <table-reader id="r" data-from="#t[history]"></table-reader>
    <reactive-display id="d"></reactive-display>`
  const reader = document.getElementById("r") as TableReader
  runtime = mountWidgetEffects(document.body)
  await settle()
  expect(reader.sources).toHaveLength(1)
  const effect = (TableReader as unknown as {effects: Record<string, {accepts: string[]}>}).effects["data-from"]
  const state = inspectWidgetEffects(document.body, reader, isWidgetHost)!
  expect(state.choices(effect).map(choice => choice.value)).toEqual(["#t[history]"])
  expect(state.choices(effect)[0].label).toContain("History")
  // An effect that does not restrict shapes sees every signal, declared or not.
  expect(state.choices().map(choice => choice.value)).toEqual(["#t[history]", "#t[level]", "#t[loose]"])
})

it("leaves a link to an undeclared or differently shaped signal unconnected and says why", async () => {
  document.body.innerHTML = `
    <table-source id="t"></table-source>
    <table-reader id="r" data-from="#t[level]"></table-reader>
    <table-reader id="u" data-from="#t[loose]"></table-reader>`
  const [reader, undeclared] = [document.getElementById("r") as TableReader, document.getElementById("u") as TableReader]
  runtime = mountWidgetEffects(document.body)
  await settle()
  expect(reader.sources).toHaveLength(0)
  expect(undeclared.sources).toHaveLength(0)
  expect(inspectWidgetEffects(document.body, reader, isWidgetHost)!.statuses?.get("data-from")?.message).toContain("Signal shape not accepted")
  expect(validateWidgetEffect(document.body, reader, "data-from", "#t[level]", isWidgetHost)).toContain("Expected table")
  expect(validateWidgetEffect(document.body, reader, "data-from", "#t[history]", isWidgetHost)).toBeUndefined()
})

it("reads shape declarations from the static signals map and ignores malformed ones", () => {
  const declared = widgetSignalDeclarations(document.createElement("table-source") as TableSource)
  expect(declared.get("history")?.shape).toBe("table")
  class Bad extends HTMLElement { static signals = {a: null, b: 3, c: {shape: "number"}} }
  customElements.define("bad-signals", Bad)
  expect([...widgetSignalDeclarations(document.createElement("bad-signals") as Bad).keys()]).toEqual(["c"])
  expect(effectAccepts({}, undefined)).toBe(true)
  expect(effectAccepts({accepts: []}, undefined)).toBe(true)
  expect(effectAccepts({accepts: ["table"]}, undefined)).toBe(false)
})

it("discovers and connects signals from widgets nested inside container widgets", async () => {
  if(!customElements.get("outer-pages")) customElements.define("outer-pages", class extends HTMLElement {})
  if(!customElements.get("inner-page")) customElements.define("inner-page", class extends HTMLElement {})
  document.body.innerHTML = `
    <outer-pages id="pages">
      <inner-page>
        <reactive-source id="nested"></reactive-source>
      </inner-page>
      <inner-page>
        <reactive-display id="nested-display" effect="#nested[value]"></reactive-display>
      </inner-page>
    </outer-pages>
    <reactive-display id="outer-display" effect="#nested[value]"></reactive-display>`
  const source = document.getElementById("nested") as ReactiveSource
  const nestedDisplay = document.getElementById("nested-display") as ReactiveDisplay
  const outerDisplay = document.getElementById("outer-display") as ReactiveDisplay
  runtime = mountWidgetEffects(document.body)
  await settle()
  expect(nestedDisplay.values).toEqual([2])
  expect(outerDisplay.values).toEqual([2])
  source.value.set(7)
  await settle()
  expect(nestedDisplay.values).toEqual([2, 7])
  expect(outerDisplay.values).toEqual([2, 7])
  expect(inspectWidgetEffects(document.body, outerDisplay, isWidgetHost)?.choices().map(c => c.value)).toContain("#nested[value]")
  expect(validateWidgetEffect(document.body, outerDisplay, "effect", "#nested[value]", isWidgetHost)).toBeUndefined()
})
