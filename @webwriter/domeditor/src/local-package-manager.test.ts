// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "./packages"

const {loadLocalPackage, localPackageWatchPaths} = vi.hoisted(() => ({
  loadLocalPackage: vi.fn(),
  localPackageWatchPaths: vi.fn(() => []),
}))

vi.mock("./local-package", () => ({
  loadLocalPackage,
  localPackageWatchPaths,
  readLocalPackageReadme: vi.fn(),
}))

vi.mock("./local-package-monitor", () => ({
  LocalPackageMonitor: class {
    async start() {}
    async setPaths() {}
    dispose() {}
  },
}))

import {LocalPackageManager, type LocalPackageRecord} from "./local-package-manager"

const pkg = (name = "@local/quiz"): WebWriterPackage => ({
  name, version: "1.0.0", label: "Quiz", description: "", authors: [], keywords: [], links: {},
  members: [], scripts: [], styles: [], manifest: {name, version: "1.0.0"},
} as unknown as WebWriterPackage)

const makeManager = () => {
  const options = {
    changed: vi.fn(), refreshing: vi.fn(), error: vi.fn(), loaded: vi.fn(), install: vi.fn(async () => {}),
  }
  const manager = new LocalPackageManager(options)
  vi.spyOn((manager as any).worker, "start").mockResolvedValue({})
  manager.disconnect()
  return {manager, options}
}

const loaded = (name = "@local/quiz") => ({package: pkg(name), warnings: []})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  loadLocalPackage.mockReset()
})

describe("LocalPackageManager folder permission renewal", () => {
  it.each(["permission", "read"])("restores other packages when a folder's %s never settles", async step => {
    vi.useFakeTimers()
    const {manager, options} = makeManager()
    let finish!: (value: any) => void
    const pending = new Promise<any>(resolve => { finish = resolve })
    const stale = {name: "stale", queryPermission: () => step === "permission" ? pending : Promise.resolve("granted")}
    const healthy = {name: "quiz", queryPermission: async () => "granted"}
    ;(manager as any).worker.storedDirectories = async () => [
      {id: "stale", handle: stale}, {id: "healthy", handle: healthy},
    ]
    loadLocalPackage.mockImplementation(async directory => directory === stale && step === "read" ? pending : loaded())
    const restoring = manager.restore()

    await vi.advanceTimersByTimeAsync(0)

    expect(manager.records.get("healthy")?.package.name).toBe("@local/quiz")
    expect(options.changed).toHaveBeenCalledWith([expect.objectContaining({name: "@local/quiz"})])

    await vi.advanceTimersByTimeAsync(5000)
    await expect(restoring).resolves.toEqual([expect.objectContaining({name: "@local/quiz"})])
    const placeholder = manager.records.get("stale")
    expect(placeholder?.directory).toBe(stale)
    expect(placeholder?.error).toContain("timed out")
    expect(placeholder?.error).toContain("Click Refresh")

    finish(step === "permission" ? "granted" : loaded("@local/stale"))
    await vi.advanceTimersByTimeAsync(0)
    expect(manager.records.get("stale")).toBe(placeholder)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("finishes restoration even when starting a folder watcher never settles", async () => {
    const {manager} = makeManager()
    ;(manager as any).worker.storedDirectories = async () => [{id: "saved-quiz", handle: {name: "quiz"}}]
    vi.spyOn(manager, "watch").mockImplementation(() => new Promise(() => {}))
    loadLocalPackage.mockResolvedValueOnce(loaded())
    let restored: WebWriterPackage[] | undefined
    void manager.restore().then(packages => { restored = packages })

    await vi.waitFor(() => expect(restored).toEqual([expect.objectContaining({name: "@local/quiz"})]))
  })

  it("restores a placeholder without prompting, then loads it after manual refresh grants access", async () => {
    const {manager} = makeManager()
    const handle = {
      name: "quiz",
      queryPermission: vi.fn(async () => "prompt"),
      requestPermission: vi.fn(async () => "granted"),
    }
    ;(manager as any).worker = {
      storedDirectories: async () => [{id: "saved-quiz", handle}],
      start: vi.fn(async () => {}),
    }
    loadLocalPackage.mockResolvedValueOnce(loaded())

    await manager.restore()

    expect(handle.queryPermission).toHaveBeenCalledWith({mode: "read"})
    expect(handle.requestPermission).not.toHaveBeenCalled()
    expect(manager.records.get("saved-quiz")?.error).toContain("Click Refresh")
    expect(loadLocalPackage).not.toHaveBeenCalled()

    await manager.refresh("saved-quiz", true)

    expect(handle.requestPermission).toHaveBeenCalledTimes(1)
    expect(loadLocalPackage).toHaveBeenCalledTimes(1)
    expect(manager.records.get("saved-quiz")?.error).toBeUndefined()
    expect(manager.records.get("saved-quiz")?.package.name).toBe("@local/quiz")
  })

  it("restores installed packages with read access even when write access needs renewal", async () => {
    const {manager} = makeManager()
    const handle = {
      name: "quiz",
      queryPermission: vi.fn(async ({mode}: {mode: string}) => mode === "read" ? "granted" : "prompt"),
      requestPermission: vi.fn(),
    }
    ;(manager as any).worker.storedDirectories = async () => [{id: "saved-quiz", handle}]
    loadLocalPackage.mockResolvedValueOnce(loaded())

    await expect(manager.restore()).resolves.toEqual([expect.objectContaining({name: "@local/quiz"})])

    expect(manager.records.get("saved-quiz")?.error).toBeUndefined()
    expect(handle.requestPermission).not.toHaveBeenCalled()
  })

  it("retains saved folders when worker startup fails and retries on manual refresh", async () => {
    const {manager, options} = makeManager()
    const handle = {name: "quiz", requestPermission: vi.fn(async () => "granted")}
    const start = vi.fn().mockRejectedValueOnce(new Error("Worker startup failed")).mockResolvedValue({})
    ;(manager as any).worker = {
      storedDirectories: async () => [{id: "saved-quiz", handle}],
      start,
    }

    await expect(manager.restore()).resolves.toEqual([])

    expect(manager.records.get("saved-quiz")?.directory).toBe(handle)
    expect(manager.records.get("saved-quiz")?.error).toBe("Worker startup failed")
    expect(options.changed).toHaveBeenLastCalledWith([expect.objectContaining({label: "quiz"})])
    expect(loadLocalPackage).not.toHaveBeenCalled()

    loadLocalPackage.mockResolvedValueOnce(loaded())
    await manager.refresh("saved-quiz", true)

    expect(start).toHaveBeenCalledTimes(2)
    expect(manager.records.get("saved-quiz")?.error).toBeUndefined()
    expect(manager.records.get("saved-quiz")?.package.name).toBe("@local/quiz")
  })

  it("keeps the actionable message when manual permission renewal is denied", async () => {
    const {manager, options} = makeManager()
    const handle = {name: "quiz", requestPermission: vi.fn(async () => "denied")}
    const record = {
      id: "quiz", directory: handle, package: pkg(), warnings: [], revision: 0, enabled: true,
    } as unknown as LocalPackageRecord
    manager.records.set(record.id, record)

    await manager.refresh(record.id, true)

    expect(handle.requestPermission).toHaveBeenCalledTimes(1)
    expect(loadLocalPackage).not.toHaveBeenCalled()
    expect(record.error).toContain("Click Refresh")
    expect(options.error).toHaveBeenCalledWith("Quiz: Folder access is unavailable. Click Refresh to grant access to this folder.")
  })

  it("does not request permission during automatic refresh", async () => {
    const {manager} = makeManager()
    const handle = {name: "quiz", requestPermission: vi.fn(async () => "granted")}
    const record = {
      id: "quiz", directory: handle, package: pkg(), warnings: [], revision: 0, enabled: true,
    } as unknown as LocalPackageRecord
    manager.records.set(record.id, record)
    loadLocalPackage.mockResolvedValueOnce(loaded())

    await manager.refresh(record.id)

    expect(handle.requestPermission).not.toHaveBeenCalled()
    expect(loadLocalPackage).toHaveBeenCalledTimes(1)
  })
})
