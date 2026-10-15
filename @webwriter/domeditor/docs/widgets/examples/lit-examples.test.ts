// @vitest-environment happy-dom
import {afterAll, afterEach, describe, expect, it, vi} from "vitest"
import {LitElement} from "lit"
import {LitElementWw} from "@webwriter/lit"
import "./lit/06-collaboration.js"

// Happy DOM does not implement native scoped registries; browser tests cover rendering there.
const renderRoot = vi.spyOn(LitElementWw.prototype as any, "createRenderRoot")
  .mockImplementation(function(this: LitElementWw) {
    return (LitElement.prototype as any).createRenderRoot.call(this)
  })
afterAll(() => renderRoot.mockRestore())

const widgets: HTMLElement[] = []

function createWidget(managed = true) {
  const widget = document.createElement("ww-quiz")
  const question = document.createElement("p")
  question.textContent = "The Moon is a star."
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = '{"choice":""}'
  widget.append(question, block)
  if(managed) widget.addEventListener("datarequest", event => event.preventDefault())
  document.body.append(widget)
  widgets.push(widget)
  return {widget, block}
}

async function render(widget: HTMLElement) {
  await (widget as HTMLElement & {updateComplete: Promise<boolean>}).updateComplete
}

function datachange(block: Element) {
  block.dispatchEvent(new CustomEvent("datachange", {bubbles: true}))
}

function output(widget: HTMLElement) {
  return widget.shadowRoot!.querySelector("output")!.textContent
}

afterEach(() => {
  for(const widget of widgets.splice(0)) widget.remove()
  expect(document.body.querySelector("ww-quiz")).toBeNull()
})

describe("Lit quiz example", () => {
  it("starts unready and accepts successive changes to the same data block", async () => {
    const {widget, block} = createWidget()
    await render(widget)

    expect(output(widget)).toBe("Loading answers…")
    expect(widget.shadowRoot!.querySelector("button")!.disabled).toBe(true)

    block.textContent = '{"choice":"true"}'
    datachange(block)
    await render(widget)
    expect(output(widget)).toBe("Try again.")

    block.textContent = '{"choice":"false"}'
    datachange(block)
    await render(widget)
    expect(output(widget)).toBe("Correct!")
    expect(widget.shadowRoot!.querySelector("button")!.disabled).toBe(false)
  })

  it("ignores nested and stale datachange events", async () => {
    const {widget, block} = createWidget()
    const nested = document.createElement("script")
    nested.type = "application/json"
    nested.slot = "data"
    nested.textContent = '{"choice":"true"}'
    const wrapper = document.createElement("div")
    wrapper.append(nested)
    widget.append(wrapper)
    await render(widget)

    datachange(nested)
    await render(widget)
    expect(output(widget)).toBe("Loading answers…")

    datachange(block)
    await render(widget)
    const replacement = document.createElement("script")
    replacement.type = "application/json"
    replacement.slot = "data"
    replacement.textContent = '{"choice":"false"}'
    const staleWrapper = document.createElement("div")
    staleWrapper.append(block)
    widget.prepend(replacement)
    widget.append(staleWrapper)
    await new Promise(resolve => setTimeout(resolve, 0))

    datachange(block)
    ;(widget as HTMLElement & {requestUpdate: () => void}).requestUpdate()
    await render(widget)
    expect(output(widget)).toBe("Loading answers…")
  })

  it("prevents answer writes while the widget is contenteditable", async () => {
    const {widget, block} = createWidget()
    datachange(block)
    await render(widget)
    widget.setAttribute("contenteditable", "true")
    await render(widget)

    widget.shadowRoot!.querySelector<HTMLButtonElement>('button[value="true"]')!.click()
    await render(widget)

    expect(block.textContent).toBe('{"choice":""}')
    expect(widget.shadowRoot!.querySelector(".controls")!.hasAttribute("hidden")).toBe(true)
  })

  it("uses local data without a runtime and preserves unrelated fields on writes", async () => {
    const {widget, block} = createWidget(false)
    block.textContent = '{"choice":"false","keep":42}'
    await new Promise(resolve => setTimeout(resolve, 0))
    await render(widget)
    expect(output(widget)).toBe("Correct!")
    widget.shadowRoot!.querySelector<HTMLButtonElement>('button[value="true"]')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    await render(widget)
    expect(widget.querySelector('script[slot="data"]')).toBe(block)
    expect(JSON.parse(block.textContent!)).toEqual({choice: "true", keep: 42})
    expect(output(widget)).toBe("Try again.")
  })

  it("shows data errors and recovers after the next accepted snapshot", async () => {
    const {widget, block} = createWidget()
    block.dispatchEvent(new CustomEvent("dataerror", {bubbles: true, detail: {message: "Connection unavailable"}}))
    await render(widget)
    expect(output(widget)).toBe("Connection unavailable")
    block.dispatchEvent(new CustomEvent("datapending", {bubbles: true}))
    await render(widget)
    expect(output(widget)).toBe("Loading answers…")
    block.textContent = '{"choice":"false"}'
    datachange(block)
    await render(widget)
    expect(output(widget)).toBe("Correct!")
  })

  it("keeps readiness for an unchanged shared value and resets it when the value changes", async () => {
    const {widget, block} = createWidget()
    widget.setAttribute("shared", "")
    datachange(block)
    await render(widget)
    expect(widget.shadowRoot!.querySelector("button")!.disabled).toBe(false)

    widget.setAttribute("shared", "")
    await render(widget)
    expect(widget.shadowRoot!.querySelector("button")!.disabled).toBe(false)

    widget.setAttribute("shared", "group")
    await render(widget)
    expect(output(widget)).toBe("Loading answers…")
    expect(widget.shadowRoot!.querySelector("button")!.disabled).toBe(true)
  })
})
