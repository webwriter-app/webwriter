// @vitest-environment happy-dom
import {act} from "react"
import {afterEach, describe, expect, it} from "vitest"
import "./06-collaboration.jsx"

;(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

const widgets: HTMLElement[] = []

function createBlock(state: Record<string, unknown> = {choice: ""}) {
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = JSON.stringify(state)
  return block
}

async function reactAct(action: () => void) {
  await act(async () => {
    action()
    await Promise.resolve()
  })
}

async function settleMutations() {
  await Promise.resolve()
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

function dataEvent(block: Element, type: "datachange" | "dataerror", detail?: unknown) {
  block.dispatchEvent(new CustomEvent(type, {bubbles: true, detail}))
}

function output(widget: HTMLElement) {
  return widget.shadowRoot!.querySelector("output")!.textContent
}

async function createWidget(block = createBlock()) {
  const widget = document.createElement("ww-quiz") as HTMLElement & {answer: string}
  widget.setAttribute("answer", "false")
  const question = document.createElement("p")
  question.textContent = "The Moon is a star."
  widget.append(question, block)
  widgets.push(widget)
  await reactAct(() => document.body.append(widget))
  return {widget, block, question}
}

afterEach(async () => {
  await reactAct(() => {
    for(const widget of widgets.splice(0)) widget.remove()
  })
  expect(document.body.querySelector("ww-quiz")).toBeNull()
})

describe("React quiz example", () => {
  it("reads the authored answer synchronously and reacts to attribute updates", async () => {
    const {widget, block} = await createWidget(createBlock({choice: "true"}))
    await reactAct(() => dataEvent(block, "datachange"))
    expect(widget.answer).toBe("false")
    expect(output(widget)).toBe("Try again.")

    await reactAct(() => widget.setAttribute("answer", "true"))
    expect(widget.answer).toBe("true")
    expect(output(widget)).toBe("Correct!")
  })

  it("exposes widget options and actions while keeping the answer in an attribute", async () => {
    const {widget} = await createWidget()
    const definition = widget.constructor as typeof HTMLElement & {
      options: Record<string, unknown>
      actions: Record<string, unknown>
    }
    expect(definition.options.answer).toBeDefined()
    expect(definition.actions.resetAnswer).toBeDefined()

    await reactAct(() => widget.setAttribute("answer", "true"))
    ;(widget as HTMLElement & {resetAnswer: () => void}).resetAnswer()
    expect(widget.getAttribute("answer")).toBe("false")
  })

  it("treats contenteditable=false as non-editing and keeps UI in shadow DOM", async () => {
    const {widget, block, question} = await createWidget()
    const authoredChildren = [...widget.childNodes]
    widget.setAttribute("contenteditable", "false")
    await reactAct(() => dataEvent(block, "datachange"))

    expect(widget.shadowRoot!.querySelector(".controls")!.hasAttribute("hidden")).toBe(false)
    expect([...widget.childNodes]).toEqual(authoredChildren)
    expect(widget.contains(widget.shadowRoot!.querySelector("button"))).toBe(false)
    expect(question.textContent).toBe("The Moon is a star.")

    await reactAct(() => widget.shadowRoot!.querySelector<HTMLButtonElement>('button[value="true"]')!.click())
    expect(block.textContent).toBe('{"choice":"true"}')
  })

  it("gates readiness on the current direct data block", async () => {
    const {widget, block} = await createWidget()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)

    const nested = createBlock({choice: "true"})
    const wrapper = document.createElement("div")
    wrapper.append(nested)
    widget.append(wrapper)
    await reactAct(() => dataEvent(nested, "datachange"))
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)

    await reactAct(() => dataEvent(block, "datachange"))
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)

    const replacement = createBlock({choice: "false"})
    await reactAct(() => widget.prepend(replacement))
    await settleMutations()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)

    await reactAct(() => dataEvent(block, "datachange"))
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)
    await reactAct(() => dataEvent(replacement, "datachange"))
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)
  })

  it("keeps an accepted same-turn replacement ready after observer delivery", async () => {
    const {widget, block} = await createWidget()
    await reactAct(() => dataEvent(block, "datachange"))
    const replacement = createBlock({choice: "false"})

    await reactAct(() => {
      widget.prepend(replacement)
      dataEvent(replacement, "datachange")
    })
    await settleMutations()

    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)
    expect(output(widget)).toBe("Correct!")
  })

  it("preserves unknown fields when updating the current shared JSON block", async () => {
    const {widget, block} = await createWidget(createBlock({choice: "", attempts: 3, nested: {source: "remote"}}))
    await reactAct(() => dataEvent(block, "datachange"))
    await reactAct(() => widget.shadowRoot!.querySelector<HTMLButtonElement>('button[value="true"]')!.click())

    expect(JSON.parse(block.textContent!)).toEqual({choice: "true", attempts: 3, nested: {source: "remote"}})
  })

  it("cleans up listeners and root across disconnect and reconnect", async () => {
    const {widget, block} = await createWidget(createBlock({choice: "false"}))
    await reactAct(() => dataEvent(block, "datachange"))
    expect(widget.shadowRoot!.querySelectorAll("section")).toHaveLength(1)

    await reactAct(() => widget.remove())
    expect(widget.shadowRoot!.querySelector("section")).toBeNull()
    await reactAct(() => dataEvent(block, "dataerror", {message: "Disconnected error"}))
    await reactAct(() => document.body.append(widget))
    expect(widget.shadowRoot!.querySelectorAll("section")).toHaveLength(1)
    expect(output(widget)).toBe("Loading answers…")
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)

    await reactAct(() => dataEvent(block, "datachange"))
    expect(output(widget)).toBe("Correct!")
  })
})
