// @vitest-environment happy-dom
import {Signal} from "signal-polyfill"
import {afterEach, expect, it, vi} from "vitest"
import {mountWidgetEffects, parseWidgetEffectReference, validateWidgetEffect, widgetEffectReference, type WidgetSignal} from "./widget-effects"

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
