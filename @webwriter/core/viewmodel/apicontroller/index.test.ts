import assert from "assert"
import publishedPackageMajors from "./published-packages.json"

describe("WebWriter 1 published catalog", () => {
  it("pins one major version per discoverable package name", () => {
    assert.ok(publishedPackageMajors.length > 0)
    const names = new Set<string>()
    for(const id of publishedPackageMajors) {
      const separator = id.lastIndexOf("@")
      const name = id.slice(0, separator)
      const major = id.slice(separator + 1)
      assert.match(name, /^@[^/@]+\/[^/@]+$/)
      assert.match(major, /^(0|[1-9]\d*)$/)
      assert.ok(!names.has(name), `Duplicate package: ${name}`)
      names.add(name)
    }
  })

  it("keeps PhET on major 1", () => {
    assert.ok(publishedPackageMajors.includes("@webwriter/phet-simulation@1"))
  })
})
