// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {createBrowserDistributionValidator} from "./distribution-snapshot"
import {distributionTarget, emptyDistributionConfig, encodeDistributionConfig} from "./distribution.js"
import type {DistributionConfig} from "./distribution.js"

describe("browser distribution validation", () => {
  const policy: DistributionConfig = {...emptyDistributionConfig("box"), permissions: ["edit"]}
  const page = (body: string, config = policy) => `<!doctype html><html><head><!--?${distributionTarget} ${encodeDistributionConfig(config)}?--></head><body>${body}</body></html>`

  it("uses host policy when validating learner snapshots", () => {
    const before = page('<div id="box"><p>before</p></div>')
    const validator = createBrowserDistributionValidator(before)
    expect(validator.configured).toBe(true)
    expect(validator.validate(undefined, page('<div id="box"><p>after</p></div>'))).toBe(true)
    expect(validator.validate(undefined, page('<div id="box"><script>bad()</script></div>'))).toBe(false)
    expect(validator.validate(undefined, page('<div id="box"><p>after</p></div>', {...policy, permissions: ["edit", "delete"]}))).toBe(false)
  })

  it("rejects malformed or duplicate host instructions", () => {
    const instruction = `<!--?${distributionTarget} ${encodeDistributionConfig(policy)}?-->`
    expect(() => createBrowserDistributionValidator(`<html><head>${instruction}${instruction}</head><body></body></html>`)).toThrow()
    expect(() => createBrowserDistributionValidator(`<html><head><!--?${distributionTarget} bad?--></head><body></body></html>`)).toThrow()
    expect(createBrowserDistributionValidator("<p>no policy</p>").configured).toBe(false)
  })
})
