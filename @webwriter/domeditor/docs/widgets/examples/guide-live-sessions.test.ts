// @vitest-environment happy-dom
import {afterEach, expect, it} from "vitest"
import {mount} from "./guide-live-sessions.js"

afterEach(() => document.body.replaceChildren())

it("updates the participant glossary as the author's setting changes", () => {
  const root = document.createElement("main")
  document.body.append(root)
  mount(root)

  const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  const widget = root.querySelector<HTMLElement & {allowGlossary: boolean}>("ww-workshop-glossary")!
  const glossary = widget.shadowRoot!.querySelector("details")!
  expect(widget.allowGlossary).toBe(true)
  expect(glossary.hidden).toBe(false)

  glossary.open = true
  checkbox.click()
  expect(widget.hasAttribute("allow-glossary")).toBe(false)
  expect(glossary.hidden).toBe(true)
  expect(glossary.open).toBe(false)

  widget.allowGlossary = true
  expect(widget.getAttribute("allow-glossary")).toBe("")
  expect(glossary.hidden).toBe(false)
})
