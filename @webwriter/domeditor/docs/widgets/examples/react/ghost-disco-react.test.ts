// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {act} from "react"
import "./ww-ghost-disco.js"

// Happy DOM does not implement form-associated custom elements.
vi.hoisted(() => {
  HTMLElement.prototype.attachInternals ??= () => ({
    setFormValue() {}, setValidity() {}, reportValidity: () => true,
  }) as ElementInternals
})

;(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

async function update(action: () => void) {
  await act(async () => { action() })
}

const widgets: HTMLElement[] = []

function createData(move = "") {
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = JSON.stringify({move, keep: true})
  return block
}

function send(block: HTMLScriptElement, type = "datachange") {
  block.dispatchEvent(new CustomEvent(type, {bubbles: true}))
}

async function createWidget(managed = false) {
  const widget = document.createElement("ww-ghost-disco") as HTMLElement & {
    lighting: string
    resetLighting: () => void
  }
  const invite = document.createElement("p")
  invite.textContent = "Costumes welcome!"
  const block = createData()
  widget.append(invite, block)
  if(managed) widget.addEventListener("datarequest", event => event.preventDefault())
  widgets.push(widget)
  await update(() => document.body.append(widget))
  const shadow = widget.shadowRoot!
  return {
    widget, block, invite,
    stage: shadow.querySelector(".stage")!,
    ghost: shadow.querySelector(".ghost")!,
    float: shadow.querySelector<HTMLButtonElement>('button[value="float"]')!,
    twirl: shadow.querySelector<HTMLButtonElement>('button[value="twirl"]')!,
    output: shadow.querySelector("output[aria-live]")!,
    controls: shadow.querySelector<HTMLElement>(".controls")!,
  }
}

afterEach(async () => {
  await update(() => {
    for(const widget of widgets.splice(0)) widget.remove()
  })
})

it("keeps the invitation authored and reflects the lighting option in the stage", async () => {
  const {widget, invite, stage, controls} = await createWidget()
  expect(widget.lighting).toBe("moonlight")
  expect(widget.shadowRoot!.querySelector("slot")).not.toBeNull()
  expect(widget.firstElementChild).toBe(invite)
  const definition = widget.constructor as typeof HTMLElement & {
    options: {lighting: {group: string}}
  }
  expect(definition.options.lighting.group).toBe("disco")

  await update(() => { widget.lighting = "neon" })
  expect(widget.getAttribute("lighting")).toBe("neon")
  expect(stage.getAttribute("data-lighting")).toBe("neon")

  await update(() => widget.setAttribute("contenteditable", "true"))
  expect(controls.hidden).toBe(true)
  await update(() => widget.resetLighting())
  expect(stage.getAttribute("data-lighting")).toBe("moonlight")
})

it("writes only to a ready direct data block and renders accepted remote moves", async () => {
  const {widget, block, float, twirl, ghost, output} = await createWidget(true)
  expect(float.disabled).toBe(true)
  expect(output.textContent).toBe("Pick a dance move.")
  await update(() => send(block))
  expect(float.disabled).toBe(false)

  await update(() => float.click())
  expect(JSON.parse(block.textContent!)).toEqual({move: "float", keep: true})
  expect(float.getAttribute("aria-pressed")).toBe("true")
  expect(output.textContent).toBe("The ghost floats!")

  const requests: Event[] = []
  widget.addEventListener("datarequest", event => requests.push(event))
  await update(() => widget.setAttribute("shared", "group"))
  expect(requests.at(-1)?.target).toBe(block)
  expect(twirl.disabled).toBe(true)
  await update(() => send(block, "datapending"))
  expect(twirl.disabled).toBe(true)
  const replacement = createData("twirl")
  replacement.addEventListener("datarequest", () => send(replacement))
  await update(() => widget.replaceChild(replacement, block))
  await update(() => {})
  expect(ghost.getAttribute("data-move")).toBe("twirl")
  expect(twirl.getAttribute("aria-pressed")).toBe("true")
  expect(output.textContent).toBe("The ghost twirls!")
  expect(JSON.parse(replacement.textContent!)).toEqual({move: "twirl", keep: true})
})
