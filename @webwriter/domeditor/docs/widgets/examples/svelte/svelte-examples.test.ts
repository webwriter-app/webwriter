// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import "./06-collaboration.svelte"

const widgets: HTMLElement[] = []

function createBlock(choice = "") {
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = JSON.stringify({choice})
  return block
}

function createWidget(block = createBlock()) {
  const widget = document.createElement("ww-quiz") as HTMLElement & {
    answer: string
    resetAnswer(): void
  }
  const question = document.createElement("p")
  question.textContent = "The Moon is a star."
  widget.setAttribute("answer", "false")
  widget.append(question, block)
  widgets.push(widget)
  return {widget, question, block}
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 10))
  await Promise.resolve()
}

function dataEvent(block: Element, type: "datachange" | "dataerror", detail?: unknown) {
  block.dispatchEvent(new CustomEvent(type, {bubbles: true, detail}))
}

function output(widget: HTMLElement) {
  return widget.shadowRoot?.querySelector("output")?.textContent
}

afterEach(async () => {
  for(const widget of widgets.splice(0)) widget.remove()
  await settle()
  expect(document.body.querySelector("ww-quiz")).toBeNull()
})

describe("Svelte quiz example", () => {
  it("keeps a datachange received before the Svelte component mounts", async () => {
    const {widget, block} = createWidget(createBlock("false"))
    dataEvent(block, "datachange")
    document.body.append(widget)
    await settle()

    expect(output(widget)).toBe("Correct!")
    expect(widget.shadowRoot?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false)
  })

  it("preserves the latest dataerror until a datachange or local write", async () => {
    const {widget, block} = createWidget()
    dataEvent(block, "dataerror", {message: "Invalid shared answers"})
    document.body.append(widget)
    await settle()

    expect(output(widget)).toBe("Invalid shared answers")
    block.textContent = '{"choice":"false"}'
    await settle()
    expect(output(widget)).toBe("Invalid shared answers")

    dataEvent(block, "datachange")
    await settle()
    expect(output(widget)).toBe("Correct!")
  })

  it("reflects answer metadata/actions and treats contenteditable=false as preview", async () => {
    const {widget, block, question} = createWidget()
    document.body.append(widget)
    await settle()
    const elementClass = customElements.get("ww-quiz") as typeof HTMLElement & {
      options?: Record<string, unknown>
      actions?: Record<string, unknown>
    }

    expect(elementClass.options?.answer).toBeDefined()
    expect(elementClass.actions?.resetAnswer).toBeDefined()
    expect(widget.answer).toBe("false")
    widget.answer = "true"
    await settle()
    expect(widget.getAttribute("answer")).toBe("true")
    widget.resetAnswer()
    await settle()
    expect(widget.answer).toBe("false")

    widget.setAttribute("contenteditable", "false")
    dataEvent(block, "datachange")
    await settle()
    expect(widget.shadowRoot?.querySelector(".controls")?.hasAttribute("hidden")).toBe(false)
    widget.shadowRoot?.querySelector<HTMLButtonElement>('button[value="false"]')?.click()
    await settle()
    expect(block.textContent).toBe('{"choice":"false"}')
    expect(output(widget)).toBe("Correct!")
    expect(question.parentNode).toBe(widget)
  })

  it("invalidates shared readiness synchronously and ignores stale block events", async () => {
    const {widget, block} = createWidget()
    document.body.append(widget)
    dataEvent(block, "datachange")
    await settle()
    expect(widget.shadowRoot?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false)

    widget.setAttribute("shared", "group-b")
    dataEvent(block, "datachange")
    await settle()
    expect(widget.shadowRoot?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false)

    const replacement = createBlock("false")
    widget.replaceChild(replacement, block)
    await settle()
    expect(widget.shadowRoot?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true)
    dataEvent(block, "datachange")
    await settle()
    expect(widget.shadowRoot?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true)
    dataEvent(replacement, "datachange")
    await settle()
    expect(output(widget)).toBe("Correct!")
  })

  it("keeps authored nodes in light DOM and reconnects with the current block", async () => {
    const {widget, question, block} = createWidget(createBlock("false"))
    const authoredNodes = [...widget.childNodes]
    document.body.append(widget)
    await settle()
    expect([...widget.childNodes]).toEqual(authoredNodes)
    expect(widget.querySelector("button")).toBeNull()
    expect([...widget.attributes].some(attribute => attribute.name.startsWith("data-") || attribute.name === "style")).toBe(false)

    dataEvent(block, "datachange")
    await settle()
    widget.remove()
    await settle()
    document.body.append(widget)
    await settle()

    expect(question.textContent).toBe("The Moon is a star.")
    expect(output(widget)).toBe("Correct!")
    expect([...widget.childNodes]).toEqual(authoredNodes)
  })
})
