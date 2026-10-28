import {describe, expect, it} from "vitest"
import {encodeDistributionConfig, emptyDistributionConfig, distributionTarget} from "../src/distribution.js"
import {createDistributionValidator} from "./distribution.mjs"

const config = (target, permissions = [], add = [], items = []) => ({
  ...emptyDistributionConfig(target), permissions, add, items,
})
const carrier = value => `<!--?${distributionTarget} ${encodeDistributionConfig(value)}?-->`
const page = (body, policies = [], extraHead = "") =>
  `<!doctype html><html><head>${policies.map(carrier).join("")}${extraHead}</head><body>${body}</body></html>`

describe("host distribution validator", () => {
  it("uses host PI authority and rejects reader changes to head policy", () => {
    const policy = config("box", ["edit"])
    const validator = createDistributionValidator(page('<demo-box id="box">before</demo-box>', [policy]))
    const after = page('<demo-box id="box">after</demo-box>', [policy])
    expect(validator.configured).toBe(true)
    expect(validator.validate(undefined, after)).toBe(true)

    const forged = config("box", ["edit", "delete"])
    expect(validator.validate(undefined, page('<demo-box id="box">after</demo-box>', [forged]))).toBe(false)
    expect(validator.validate(undefined, page('<demo-box id="box">after</demo-box>', [policy], "<script src=\"/reader.js\"></script>"))).toBe(false)
  })

  it("applies the complete nearest override instead of inheriting parent permissions", () => {
    const inherited = config("outer", ["edit"])
    const override = config("inner", [])
    const validator = createDistributionValidator(page(
      '<section id="outer"><div id="inner">before</div><p>sibling</p></section>', [inherited, override],
    ))
    expect(validator.validate(undefined, page(
      '<section id="outer"><div id="inner">after</div><p>sibling changed</p></section>', [inherited, override],
    ))).toBe(false)
    expect(validator.validate(undefined, page(
      '<section id="outer"><div id="inner">before</div><p>sibling changed</p></section>', [inherited, override],
    ))).toBe(true)
  })

  it("denies runtime script injection in body and any head script injection", () => {
    const policy = config("box", ["edit", "move", "delete", "duplicate", "style"])
    const validator = createDistributionValidator(page('<demo-box id="box">before</demo-box>', [policy]))
    expect(validator.validate(undefined, page('<demo-box id="box">before<script>alert(1)</script></demo-box>', [policy]))).toBe(false)
    expect(validator.validate(undefined, page('<demo-box id="box">before</demo-box>', [policy], "<script>alert(1)</script>"))).toBe(false)
  })

  it("allows document edits after editor-only preview artifacts are stripped", () => {
    const policy = config("box", ["edit"])
    const before = page('<div class="◆editor-only">preview chrome</div><demo-box id="box" class="◆ ◆widget-editable" contenteditable=""><p>before</p></demo-box>', [policy])
    const after = page('<div class="◆editor-only">different preview chrome</div><demo-box id="box" class="◆ ◆widget-editable" contenteditable=""><p>after</p></demo-box>', [policy])
    const validator = createDistributionValidator(before)
    expect(validator.validate(before, after)).toBe(true)
  })

  it("allows exact configured widget templates and rejects forged lookalikes", () => {
    const item = {id: "element:demo-leaf", label: "Approved widget", html: "<demo-leaf>Approved</demo-leaf>"}
    const policy = {...config("box", [], [item.id], [item])}
    const validator = createDistributionValidator(page('<demo-box id="box"></demo-box>', [policy]))
    expect(validator.validate(undefined, page('<demo-box id="box"><demo-leaf>Approved</demo-leaf></demo-box>', [policy]))).toBe(true)
    expect(validator.validate(undefined, page('<demo-box id="box"><demo-leaf>Forged</demo-leaf></demo-box>', [policy]))).toBe(false)
  })

  it("rejects malformed or duplicate host policies and reports no-policy documents unconfigured", () => {
    expect(() => createDistributionValidator(page("<p>unchanged</p>", [], `<!--?${distributionTarget} bad?-->`))).toThrow()
    const duplicate = config("box", ["edit"])
    expect(() => createDistributionValidator(page('<demo-box id="box">text</demo-box>', [duplicate, duplicate]))).toThrow()

    const validator = createDistributionValidator(page('<p>before</p>'))
    expect(validator.configured).toBe(false)
    expect(validator.validate(undefined, page('<p>after</p>'))).toBe(false)
  })
})
