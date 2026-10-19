// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {nextTick} from "vue/dist/vue.runtime.esm-browser.js"
import "./06-collaboration.js"

const widgets: HTMLElement[] = []

function createBlock(choice = "") {
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = JSON.stringify({choice})
  return block
}

async function render() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function datachange(block: Element) {
  block.dispatchEvent(new CustomEvent("datachange", {bubbles: true}))
}

afterEach(() => {
  for(const widget of widgets.splice(0)) widget.remove()
  expect(document.body.querySelector("ww-quiz")).toBeNull()
})

describe("Vue quiz example", () => {
  it("projects authored light-DOM question content through a native shadow slot", async () => {
    const widget = document.createElement("ww-quiz")
    const question = document.createElement("p")
    question.textContent = "The Moon is a star."
    widget.append(question)
    document.body.append(widget)
    widgets.push(widget)
    await render()

    expect(widget.shadowRoot!.querySelector("slot")).not.toBeNull()
    expect(widget.querySelector("p")).toBe(question)
    expect(question.textContent).toBe("The Moon is a star.")
  })

  it("captures a datachange sent before the custom element connects", async () => {
    const widget = document.createElement("ww-quiz")
    const block = createBlock("false")
    widget.append(block)
    datachange(block)
    document.body.append(widget)
    widgets.push(widget)
    await render()

    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)
    expect(widget.shadowRoot!.querySelector("output")!.textContent).toBe("Correct!")
  })

  it("reads the authored answer synchronously and follows later attribute changes", () => {
    const widget = document.createElement("ww-quiz") as HTMLElement & {answer: string}
    widget.setAttribute("answer", "true")
    document.body.append(widget)
    widgets.push(widget)

    expect(widget.answer).toBe("true")
    widget.setAttribute("answer", "false")
    expect(widget.answer).toBe("false")
  })

  it("treats contenteditable=false as non-editing and persists a choice", async () => {
    const widget = document.createElement("ww-quiz")
    widget.setAttribute("contenteditable", "false")
    const block = createBlock()
    widget.append(block)
    document.body.append(widget)
    widgets.push(widget)
    datachange(block)
    await render()

    expect(widget.shadowRoot!.querySelector(".controls")!.hasAttribute("hidden")).toBe(false)
    expect(widget.shadowRoot!.querySelectorAll("section")).toHaveLength(1)
    expect(widget.hasAttribute("host-element")).toBe(false)
    widget.shadowRoot!.querySelector<HTMLButtonElement>('button[value="true"]')!.click()
    await render()

    expect(block.textContent).toBe('{"choice":"true"}')
    expect(widget.shadowRoot!.querySelector("output")!.textContent).toBe("Try again.")
    expect(widget.shadowRoot!.querySelectorAll("section")).toHaveLength(1)
    widget.setAttribute("answer", "true")
    expect((widget as HTMLElement & {answer: string}).answer).toBe("true")
    await render()
    expect(widget.shadowRoot!.querySelector("output")!.textContent).toBe("Correct!")
  })

  it("shows errors only from its current direct data block", async () => {
    const widget = document.createElement("ww-quiz")
    const block = createBlock()
    widget.append(block)
    document.body.append(widget)
    widgets.push(widget)
    block.dispatchEvent(new CustomEvent("dataerror", {
      bubbles: true,
      detail: {message: "Invalid answers"},
    }))
    await render()
    expect(widget.shadowRoot!.querySelector("output")!.textContent).toBe("Invalid answers")

    const nested = createBlock()
    const wrapper = document.createElement("div")
    wrapper.append(nested)
    widget.append(wrapper)
    nested.dispatchEvent(new CustomEvent("dataerror", {
      bubbles: true,
      detail: {message: "Nested error"},
    }))
    await render()
    expect(widget.shadowRoot!.querySelector("output")!.textContent).toBe("Invalid answers")
  })

  it("ignores nested, stale, and replaced data blocks", async () => {
    const widget = document.createElement("ww-quiz")
    const original = createBlock()
    widget.append(original)
    document.body.append(widget)
    widgets.push(widget)
    datachange(original)
    await render()

    const replacement = createBlock("false")
    widget.prepend(replacement)
    await render()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)

    datachange(original)
    await render()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)

    const nested = createBlock("true")
    const wrapper = document.createElement("div")
    wrapper.append(nested)
    widget.append(wrapper)
    datachange(nested)
    await render()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)
  })

  it("keeps an accepted same-turn replacement ready after observer delivery", async () => {
    const widget = document.createElement("ww-quiz")
    const original = createBlock()
    widget.append(original)
    document.body.append(widget)
    widgets.push(widget)
    datachange(original)
    await render()

    const replacement = createBlock("false")
    widget.prepend(replacement)
    datachange(replacement)
    await render()

    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)
    expect(widget.shadowRoot!.querySelector("output")!.textContent).toBe("Correct!")
  })

  it("invalidates data readiness when shared mode changes", async () => {
    const widget = document.createElement("ww-quiz")
    const block = createBlock("false")
    widget.append(block)
    document.body.append(widget)
    widgets.push(widget)
    datachange(block)
    await render()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)

    widget.setAttribute("shared", "true")
    await render()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true)
    datachange(block)
    await render()
    expect(widget.shadowRoot!.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false)
  })
})
