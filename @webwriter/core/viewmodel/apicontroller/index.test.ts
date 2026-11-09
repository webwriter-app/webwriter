import assert from "assert"
import {valid} from "semver"
import publishedPackageIDs from "./published-packages.json"

describe("WebWriter 1 published catalog", () => {
  it("pins one exact version per discoverable package name", () => {
    assert.ok(publishedPackageIDs.length > 0)
    const names = new Set<string>()
    for(const id of publishedPackageIDs) {
      const separator = id.lastIndexOf("@")
      const name = id.slice(0, separator)
      const version = id.slice(separator + 1)
      assert.match(name, /^@[^/@]+\/[^/@]+$/)
      assert.equal(valid(version), version)
      assert.ok(!names.has(name), `Duplicate package: ${name}`)
      names.add(name)
    }
  })

  it("keeps the PhET version with WebWriter 1 snippets", () => {
    assert.ok(publishedPackageIDs.includes("@webwriter/phet-simulation@1.0.7"))
  })
})
