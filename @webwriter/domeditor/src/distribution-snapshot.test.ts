// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {createBrowserDistributionValidator} from "./distribution-snapshot"
import {emptyDistributionConfig, encodeDistributionConfig} from "./distribution.js"
import type {DistributionConfig} from "./distribution.js"

describe("browser distribution validation", () => {
  const policy: DistributionConfig = {...emptyDistributionConfig(), permissions: ["edit"]}
  const page = (body: string, config = policy) => `<!doctype html><html><head></head><body><div id="box">${body}<!--?ww-distribute ${encodeDistributionConfig(config)}?--></div></body></html>`

  it("uses host policy when validating learner snapshots", () => {
    const before = page('<p>before</p>')
    const validator = createBrowserDistributionValidator(before)
    expect(validator.configured).toBe(true)
    expect(validator.validate(undefined, page('<p>after</p>'))).toBe(true)
    expect(validator.validate(undefined, page('<script>bad()</script>'))).toBe(false)
    expect(validator.validate(undefined, page('<p>after</p>', {...policy, permissions: ["edit", "delete"]}))).toBe(false)
  })

  it("rejects forged or relocated inline policy instructions in learner snapshots", () => {
    const base = page('<p>before</p>')
    const validator = createBrowserDistributionValidator(base)
    const instruction = `<!--?ww-distribute ${encodeDistributionConfig({...policy, permissions: ["delete"]})}?-->`
    expect(validator.validate(undefined, `<html><head></head><body><div id="box"><p>after</p>${instruction}</div></body></html>`)).toBe(false)
    expect(validator.validate(undefined, `<html><head></head><body><section>${instruction}</section><div id="box"><p>after</p></div></body></html>`)).toBe(false)
  })

  it("rejects malformed or duplicate host instructions", () => {
    const instruction = `<!--?ww-distribute ${encodeDistributionConfig(policy)}?-->`
    expect(() => createBrowserDistributionValidator(`<html><head></head><body><div>${instruction}${instruction}</div></body></html>`)).toThrow()
    expect(() => createBrowserDistributionValidator(`<html><head></head><body><div><!--?ww-distribute bad?--></div></body></html>`)).toThrow()
    expect(createBrowserDistributionValidator("<p>no policy</p>").configured).toBe(false)
  })
})
