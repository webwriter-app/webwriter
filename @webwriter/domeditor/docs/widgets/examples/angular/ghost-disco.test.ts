// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import "./ww-ghost-disco.js"

// Happy DOM does not implement form-associated custom elements.
vi.hoisted(() => {
  HTMLElement.prototype.attachInternals ??= () => ({
    setFormValue() {}, setValidity() {}, reportValidity: () => true,
  }) as ElementInternals
})

function createBlock() {
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = '{"move":""}'
  return block
}

function sendData(block: HTMLElement, type = "datachange") {
  block.dispatchEvent(new CustomEvent(type, {bubbles: true}))
}

async function render() {
  await new Promise(resolve => setTimeout(resolve, 20))
}

afterEach(() => {
  document.body.replaceChildren()
})

it("renders reader moves separately from authored lighting", async () => {
  const widget = document.createElement("ww-ghost-disco") as HTMLElement & {
    lighting: string
    resetLighting(): void
  }
  const invitation = document.createElement("p")
  invitation.textContent = "Dance under the moon."
  const block = createBlock()
  widget.append(invitation, block)
  const dataRequests: Event[] = []
  widget.addEventListener("datarequest", event => {
    event.preventDefault()
    dataRequests.push(event)
  })

  widget.lighting = "neon"
  document.body.append(widget)
  await render()
  const shadow = widget.shadowRoot!
  const stage = shadow.querySelector(".stage")!
  const output = shadow.querySelector("output[aria-live]")!
  const twirl = shadow.querySelector<HTMLButtonElement>('button[value="twirl"]')!
  expect(stage.getAttribute("data-lighting")).toBe("neon")
  expect(widget.getAttribute("lighting")).toBe("neon")
  expect(invitation.parentNode).toBe(widget)
  expect(widget.getAttributeNames().sort()).toEqual(["lighting"])
  expect(dataRequests[0]?.target).toBe(block)
  expect(twirl.disabled).toBe(true)
  expect(output.textContent?.trim()).toBe("Pick a dance move.")

  sendData(block)
  await render()
  expect(twirl.disabled).toBe(false)
  twirl.click()
  await render()
  expect(block.textContent).toBe('{"move":"twirl"}')
  expect(twirl.getAttribute("aria-pressed")).toBe("true")
  expect(output.textContent?.trim()).toBe("The ghost twirls!")

  widget.resetLighting()
  await render()
  expect(widget.lighting).toBe("moonlight")
  expect(stage.getAttribute("data-lighting")).toBe("moonlight")
  expect(block.textContent).toBe('{"move":"twirl"}')

  block.textContent = '{"move":"float"}'
  sendData(block)
  await render()
  expect(output.textContent?.trim()).toBe("The ghost floats!")
  expect(shadow.querySelector(".ghost")?.getAttribute("data-move")).toBe("float")
  widget.setAttribute("shared", "group")
  await render()
  expect(dataRequests).toHaveLength(2)
  expect(dataRequests.at(-1)?.target).toBe(block)
  expect(twirl.disabled).toBe(true)
  sendData(block, "datapending")
  twirl.click()
  expect(block.textContent).toBe('{"move":"float"}')

  const replacement = createBlock()
  block.replaceWith(replacement)
  await render()
  expect(twirl.disabled).toBe(true)
  expect(dataRequests.at(-1)?.target).toBe(replacement)
  expect(widget.getAttribute("move")).toBeNull()

  widget.contentEditable = "true"
  await render()
  expect(shadow.querySelector(".controls")?.hasAttribute("hidden")).toBe(true)
})

it("keeps the view on a DOM move and recreates it after removal", async () => {
  const widget = document.createElement("ww-ghost-disco")
  const block = createBlock()
  block.textContent = '{"move":"float"}'
  widget.append(block)
  document.body.append(widget)
  const shadow = widget.shadowRoot!
  const stage = shadow.querySelector(".stage")!
  const wrapper = document.createElement("div")
  document.body.append(wrapper)
  wrapper.append(widget)
  await render()
  expect(shadow.querySelector(".stage")).toBe(stage)

  widget.remove()
  await render()
  expect(shadow.querySelector(".stage")).toBeNull()
  expect(shadow.querySelectorAll("style")).toHaveLength(1)
  wrapper.append(widget)
  await render()
  expect(shadow.querySelector(".stage")).not.toBe(stage)
  expect(shadow.querySelector(".ghost")?.getAttribute("data-move")).toBe("float")
  expect(widget.firstChild).toBe(block)
  expect(widget.getAttributeNames()).toEqual([])
})
