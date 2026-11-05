import {describe, expect, it, vi} from "vitest"
import {runInNewContext} from "node:vm"
import {canvasSnapshotPlugin} from "./canvas-snapshot-plugin.mjs"

describe("canvas snapshot computed styles", () => {
  it("reads the property count once while retaining every computed value", async () => {
    const plugin = canvasSnapshotPlugin()
    const source = await plugin.load.call({addWatchFile: vi.fn()}, plugin.resolveId("virtual:canvas-snapdom"))
    const start = source.indexOf("function Ef(")
    const end = source.indexOf("function Rf(", start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const names = source.slice(source.indexOf("let snapdomComputedNames"), source.indexOf("function snapdomMount"))
    const snapshot = runInNewContext(`${names}; ${source.slice(start, end)}; Ef`, {
      Oe: () => false, Ts: () => false, Rf: () => {},
    })
    const values = {width: "120px", color: "rgb(1, 2, 3)", fill: "url(#gradient)", transform: "matrix(1, 0, 0, 1, 12, 34)"}
    const count = vi.fn(() => Object.keys(values).length)
    const style = Object.assign(Object.keys(values), {getPropertyValue: (name: keyof typeof values) => values[name] ?? ""})
    const declaration = new Proxy(style, {get: (target, name) => name === "length" ? count() : Reflect.get(target, name)})
    expect(snapshot(declaration)).toMatchObject(values)
    expect(count).toHaveBeenCalledTimes(1)
    values.color = "rgb(4, 5, 6)"
    expect(snapshot(declaration)).toMatchObject(values)
    expect(count).toHaveBeenCalledTimes(1)
  })
})
