// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import "./lit/06-collaboration.js"

const widgets: HTMLElement[] = []

function createWidget() {
  const widget = document.createElement("ww-quiz")
  const question = document.createElement("p")
  question.textContent = "The Moon is a star."
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = '{"choice":""}'
  widget.append(question, block)
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
    expect((widget as HTMLElement & {block: HTMLScriptElement}).block).toBe(replacement)

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
