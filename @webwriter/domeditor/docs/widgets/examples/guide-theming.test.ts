// @vitest-environment happy-dom
import {afterEach, expect, it} from "vitest"
import {mount} from "./guide-theming.js"

afterEach(() => document.body.replaceChildren())

it("applies document themes, typography, and the opening marker override", () => {
  const root = document.createElement("main")
  document.body.append(root)
  mount(root)

  const select = root.querySelector("select")!
  const sample = root.querySelector<HTMLElement>(".timeline-document")!
  const timeline = root.querySelector("ww-garden-timeline")!
  expect(timeline.shadowRoot!.querySelectorAll("ol li")).toHaveLength(3)
  expect(timeline.shadowRoot!.querySelector('[part="opening-marker"]')).not.toBeNull()
  expect(sample.style.getPropertyValue("--ww-theme-accent-1")).toBe("#397da2")

  select.value = "Forest"
  select.dispatchEvent(new Event("change"))
  expect(sample.style.getPropertyValue("--ww-theme-accent-1")).toBe("#4f875e")

  root.querySelector<HTMLInputElement>('[name="serif"]')!.click()
  root.querySelector<HTMLInputElement>('[name="highlight"]')!.click()
  expect(sample.style.getPropertyValue("--ww-font-family")).toBe("Georgia, serif")
  expect(sample.hasAttribute("data-highlight")).toBe(true)

  select.value = "Standard"
  select.dispatchEvent(new Event("change"))
  expect(sample.style.getPropertyValue("--ww-theme-accent-1")).toBe("")
  expect(sample.style.getPropertyValue("--ww-font-family")).toBe("Georgia, serif")
  root.querySelector<HTMLInputElement>('[name="highlight"]')!.click()
  expect(sample.hasAttribute("data-highlight")).toBe(false)
})
