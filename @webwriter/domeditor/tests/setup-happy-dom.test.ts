// @vitest-environment happy-dom
import {afterEach, expect, it} from "vitest"

afterEach(() => document.body.replaceChildren())

it("ignores focus in another shadow tree and on detached nodes", () => {
  const first = document.createElement("div"), second = document.createElement("div")
  const firstRoot = first.attachShadow({mode: "open"}), secondRoot = second.attachShadow({mode: "open"})
  const input = document.createElement("input")
  firstRoot.append(input)
  document.body.append(first, second)
  input.focus()
  expect(firstRoot.activeElement).toBe(input)
  expect(secondRoot.activeElement).toBeNull()

  input.remove()
  expect(secondRoot.activeElement).toBeNull()
  expect(firstRoot.activeElement).toBeNull()
  expect(document.activeElement).toBe(document.body)
})

it("retargets focus through nested shadow hosts", () => {
  const outer = document.createElement("div"), inner = document.createElement("div")
  const outerRoot = outer.attachShadow({mode: "open"}), innerRoot = inner.attachShadow({mode: "open"})
  const input = document.createElement("input")
  innerRoot.append(input)
  outerRoot.append(inner)
  document.body.append(outer)
  input.focus()
  expect(innerRoot.activeElement).toBe(input)
  expect(outerRoot.activeElement).toBe(inner)
  expect(document.activeElement).toBe(outer)
})
