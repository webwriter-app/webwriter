import assert from "assert"
import {Package} from "./package"

describe("npm package overrides", () => {
  it("preserves flat and nested overrides, including version-qualified selectors", () => {
    const overrides = {
      lit: "^3",
      "@aidenlx/esbuild-plugin-inline-worker": {esbuild: "0.25.12", nanoid: "3.3.20"},
      "mocha@11": {".": "$mocha", glob: {minimatch: "11.0.5"}}
    }
    const pkg = new Package({name: "@webwriter/automaton", version: "4.0.0", overrides})

    assert.deepStrictEqual(pkg.overrides, overrides)
    assert.deepStrictEqual(pkg.toJSON().overrides, overrides)
  })

  it("rejects override values other than strings and nested records", () => {
    const manifest = {name: "@webwriter/automaton", version: "4.0.0"}
    assert.equal(Package.schema.safeParse({...manifest, overrides: {mocha: {glob: 14}}}).success, false)
    assert.equal(Package.schema.safeParse({...manifest, overrides: {mocha: []}}).success, false)
  })
})
