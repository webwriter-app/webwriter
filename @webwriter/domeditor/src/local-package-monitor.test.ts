import {afterEach, describe, expect, it, vi} from "vitest"
import {LocalPackageMonitor, type LocalPackageMonitorOptions} from "./local-package-monitor"
import type {LocalPackageDirectory} from "./local-package"

type Entry = {text: string, lastModified: number}
const makeDirectory = (entries: Record<string, Entry>): LocalPackageDirectory => ({
  getFileHandle: async (name: string) => {
    const entry = entries[name]
    if(!entry) throw new Error(`Missing ${name}`)
    return {getFile: async () => ({text: async () => entry.text, lastModified: entry.lastModified, size: entry.text.length})}
  },
  getDirectoryHandle: async (name: string) => makeDirectory(Object.fromEntries(
    Object.entries(entries)
      .filter(([path]) => path.startsWith(`${name}/`))
      .map(([path, entry]) => [path.slice(name.length + 1), entry]),
  )),
})

afterEach(() => vi.useRealTimers())

describe("LocalPackageMonitor", () => {
  it("uses a recursive observer and debounces notifications", async () => {
    let callback: (() => void) | undefined
    const disconnect = vi.fn()
    const factory = class {
      constructor(listener: () => void) { callback = listener }
      observe = vi.fn(() => undefined)
      disconnect = disconnect
    }
    const onChange = vi.fn()
    const monitor = new LocalPackageMonitor(makeDirectory({"dist/bundle.js": {text: "a", lastModified: 1}}), {
      onChange, observerFactory: factory as never, debounceMs: 20,
    })
    await monitor.start(["dist/bundle.js"])
    callback!()
    callback!()
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(disconnect).not.toHaveBeenCalled()
    monitor.dispose()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it("falls back to polling when observer construction/registration fails", async () => {
    vi.useFakeTimers()
    const entries: Record<string, Entry> = {"dist/bundle.js": {text: "a", lastModified: 1}}
    const onChange = vi.fn()
    const options: LocalPackageMonitorOptions = {
      onChange, intervalMs: 100, debounceMs: 0,
      observerFactory: class {
        constructor() { throw new Error("unsupported") }
      } as never,
    }
    const monitor = new LocalPackageMonitor(makeDirectory(entries), options)
    await monitor.start(["dist/bundle.js"])
    entries["dist/bundle.js"] = {text: "changed", lastModified: 2}
    await vi.advanceTimersByTimeAsync(200)
    expect(onChange).toHaveBeenCalledWith(["dist/bundle.js"])
    monitor.dispose()
  })

  it("disconnects a rejected observer and falls back to polling", async () => {
    vi.useFakeTimers()
    const entries: Record<string, Entry> = {"dist/bundle.js": {text: "a", lastModified: 1}}
    const disconnect = vi.fn()
    const observe = vi.fn().mockRejectedValue(new Error("observation unavailable"))
    const onChange = vi.fn()
    const monitor = new LocalPackageMonitor(makeDirectory(entries), {
      onChange,
      intervalMs: 100,
      debounceMs: 0,
      observerFactory: class {
        observe = observe
        disconnect = disconnect
      } as never,
    })

    await monitor.start(["dist/bundle.js"])

    expect(observe).toHaveBeenCalledWith(expect.anything(), {recursive: true})
    expect(disconnect).toHaveBeenCalledTimes(1)
    entries["dist/bundle.js"] = {text: "changed", lastModified: 2}
    await vi.advanceTimersByTimeAsync(200)
    expect(onChange).toHaveBeenCalledWith(["dist/bundle.js"])
    monitor.dispose()
  })

  it("detects first bundle creation and updates paths", async () => {
    vi.useFakeTimers()
    const entries: Record<string, Entry> = {}
    const onChange = vi.fn()
    const monitor = new LocalPackageMonitor(makeDirectory(entries), {onChange, intervalMs: 100, debounceMs: 0})
    await monitor.start(["dist/bundle.js"])
    entries["dist/bundle.js"] = {text: "new", lastModified: 3}
    await vi.advanceTimersByTimeAsync(200)
    expect(onChange).toHaveBeenCalledWith(["dist/bundle.js"])
    await monitor.setPaths(["dist/bundle.js", "dist/style.css"])
    entries["dist/style.css"] = {text: "css", lastModified: 4}
    await vi.advanceTimersByTimeAsync(200)
    expect(onChange).toHaveBeenLastCalledWith(["dist/style.css"])
    monitor.dispose()
  })

  it("stops timers and ignores late observer notifications after disposal", async () => {
    vi.useFakeTimers()
    let callback: (() => void) | undefined
    const factory = class {
      constructor(listener: () => void) { callback = listener }
      observe = vi.fn(() => undefined)
      disconnect = vi.fn()
    }
    const onChange = vi.fn()
    const monitor = new LocalPackageMonitor(makeDirectory({}), {onChange, observerFactory: factory as never, debounceMs: 10})
    await monitor.start([])
    monitor.dispose()
    callback?.()
    await vi.advanceTimersByTimeAsync(20)
    expect(onChange).not.toHaveBeenCalled()
  })
})
