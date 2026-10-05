// @vitest-environment node
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, expect, it} from "vitest"
import {componentLicensesPlugin} from "./component-licenses.mjs"

let directory
afterEach(() => {if(directory) rmSync(directory, {recursive: true, force: true})})

function fixture() {
  directory = mkdtempSync(join(tmpdir(), "component-licenses-"))
  const app = join(directory, "app")
  mkdirSync(app)
  const manifest = join(app, "package.json")
  writeFileSync(manifest, JSON.stringify({dependencies: {"@test/runtime": "*"}, devDependencies: {tool: "*"}}))
  function pkg(name, data, files) {
    const root = join(directory, "node_modules", name)
    mkdirSync(root, {recursive: true})
    writeFileSync(join(root, "package.json"), JSON.stringify({name, version: "1.2.3", ...data}))
    for(const [file, text] of Object.entries(files)) writeFileSync(join(root, file), text)
  }
  pkg("@test/runtime", {license: "MIT", exports: "./index.js", dependencies: {transitive: "*"}}, {
    "LICENSE.md": "Full runtime license <copyright>\nPermission granted.",
    "NOTICE.txt": "Runtime notice.",
  })
  pkg("tool", {licenses: [{type: "BSD-3-Clause"}]}, {COPYING: "Full tool license."})
  pkg("transitive", {license: "MIT"}, {LICENSE: "Transitive license."})
  const plugin = componentLicensesPlugin(manifest)
  const watched = []
  const load = () => plugin.load.call({addWatchFile: path => watched.push(path)}, plugin.resolveId("virtual:component-licenses"))
  return {manifest, plugin, load, watched}
}

it("bundles complete direct runtime and development license texts and notices from hoisted packages", () => {
  const {load, watched, plugin, manifest} = fixture()
  const result = load()
  const text = JSON.parse(result.slice("export default ".length))
  expect(text).toContain("@test/runtime 1.2.3 (MIT)")
  expect(text).toContain("Full runtime license <copyright>\nPermission granted.")
  expect(text).toContain("Runtime notice.")
  expect(text).toContain("tool 1.2.3 (BSD-3-Clause)")
  expect(text).toContain("Full tool license.")
  expect(text).not.toContain("transitive")
  expect(watched).toContain(manifest)
  expect(watched).toContain(join(directory, "node_modules/@test/runtime/LICENSE.md"))
  expect(plugin.resolveId("unrelated")).toBeUndefined()
  expect(plugin.load("unrelated")).toBeUndefined()
})

it("reads changed dependency manifests instead of retaining an outdated list", () => {
  const {manifest, load} = fixture()
  load()
  writeFileSync(manifest, JSON.stringify({dependencies: {tool: "*"}}))
  expect(load()).toContain("Full tool license.")
  expect(load()).not.toContain("@test/runtime")
})

it("reports missing license text instead of silently omitting a component", () => {
  const {load} = fixture()
  rmSync(join(directory, "node_modules/@test/runtime/LICENSE.md"))
  expect(load).toThrow("Cannot find license text for @test/runtime")
})
