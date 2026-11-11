// @vitest-environment happy-dom
import {afterEach, expect, it} from "vitest"
import "./06-disco-collaboration.js"

afterEach(() => document.body.replaceChildren())

it("keeps authored lighting separate from accepted shared dance moves", () => {
  const widget = document.createElement("ww-ghost-disco") as HTMLElement & {resetLighting(): void}
  widget.setAttribute("lighting", "neon")
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = '{"move":"","room":"attic"}'
  widget.append(block)
  document.body.append(widget)

  const root = widget.shadowRoot!
  const float = root.querySelector<HTMLButtonElement>('button[value="float"]')!
  const ghost = root.querySelector<HTMLElement>(".ghost")!
  expect(root.querySelector<HTMLElement>(".stage")?.dataset.lighting).toBe("neon")
  expect(float.disabled).toBe(true)
  block.dispatchEvent(new Event("datachange", {bubbles: true}))
  float.click()
  expect(JSON.parse(block.textContent!)).toEqual({move: "float", room: "attic"})
  expect(ghost.dataset.move).toBe("")
  block.dispatchEvent(new Event("datachange", {bubbles: true}))
  expect(ghost.dataset.move).toBe("float")
  expect(float.getAttribute("aria-pressed")).toBe("true")

  block.textContent = '{"move":"twirl","room":"attic"}'
  block.dispatchEvent(new Event("datachange", {bubbles: true}))
  expect(ghost.dataset.move).toBe("twirl")
  expect(root.querySelector("output")?.textContent).toBe("The ghost twirls!")
  widget.resetLighting()
  expect(widget.getAttribute("lighting")).toBe("moonlight")
  expect(ghost.dataset.move).toBe("twirl")
})
