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
  manager.disconnect()
  return {manager, options}
}

const loaded = (name = "@local/quiz") => ({package: pkg(name), warnings: []})

afterEach(() => vi.clearAllMocks())

describe("LocalPackageManager folder permission renewal", () => {
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

    expect(handle.queryPermission).toHaveBeenCalledWith({mode: "readwrite"})
    expect(handle.requestPermission).not.toHaveBeenCalled()
    expect(manager.records.get("saved-quiz")?.error).toContain("Click Refresh")
    expect(loadLocalPackage).not.toHaveBeenCalled()

    await manager.refresh("saved-quiz", true)

    expect(handle.requestPermission).toHaveBeenCalledTimes(1)
    expect(loadLocalPackage).toHaveBeenCalledTimes(1)
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
