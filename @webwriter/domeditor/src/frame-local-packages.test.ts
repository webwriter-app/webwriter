import {describe, expect, it} from "vitest"
import {frameImportMap, frameLocalPackageURL, framePackages} from "./frame-local-packages"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "./local-package-worker"
import type {WebWriterPackage} from "./packages"

const app = "https://app.example"
const frame = "https://editor.example"
const local = `${app}${LOCAL_PACKAGE_ROUTE_PREFIX}sample/widget.js?revision=2`

describe("frame local package URLs", () => {
  it("changes only reserved same-origin URLs", () => {
    expect(frameLocalPackageURL(local, app, frame)).toBe(`${frame}${LOCAL_PACKAGE_ROUTE_PREFIX}sample/widget.js?revision=2`)
    expect(frameLocalPackageURL("https://cdn.example/widget.js", app, frame)).toBe("https://cdn.example/widget.js")
    expect(frameLocalPackageURL(`${app}/ordinary.js`, app, frame)).toBe(`${app}/ordinary.js`)
  })

  it("rewrites package entries and import map addresses without changing the source", () => {
    const pkg: WebWriterPackage = {name: "sample", version: "1", label: "Sample", authors: [],
      keywords: [], links: {}, scripts: [local], styles: [],
      members: [{id: "widget", packageName: "sample", packageVersion: "1", exportName: "widget",
        kind: "widget", label: "Widget", insertable: true, scriptUrl: local}]}
    const result = framePackages([pkg], app, frame)[0]
    expect(result.scripts[0]).toContain(frame)
    expect(result.members[0].scriptUrl).toContain(frame)
    expect(pkg.scripts[0]).toBe(local)
    const map = frameImportMap({imports: {sample: local}, scopes: {[local]: {sample: local}}}, app, frame)!
    expect(map.imports?.sample).toContain(frame)
    expect(Object.keys(map.scopes ?? {})[0]).toContain(frame)
  })
})
