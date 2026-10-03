// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {gitPackageDirectory, gitPackageUrl, readGitPackageSources, saveGitPackageSources} from "./git-package"
import {LocalPackageManager} from "./local-package-manager"

vi.mock("./local-package-worker-client", () => ({
  LocalPackageWorkerClient: class {async storedDirectories() {return []}},
}))

const source = {repository: "https://github.com/example/demo.git", ref: "feature/demo", path: "packages/demo"}
const apiUrl = "http://localhost:1234/api/developer-packages/git"
const callbacks = () => ({changed: vi.fn(), loaded: vi.fn(), error: vi.fn(), install: vi.fn().mockResolvedValue(undefined), gitApiUrl: () => apiUrl})
const mockGit = () => {
  let revision = 0
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if(url === apiUrl) {
      revision++
      return new Response(JSON.stringify({id: `snapshot-${revision}`, source, commit: `commit-${revision}`, baseUrl: `${apiUrl}/snapshot-${revision}/`}), {headers: {"Content-Type": "application/json"}})
    }
    if(url.endsWith("/package.json")) return new Response(JSON.stringify({name: "@git/demo", version: `1.0.${revision}`, exports: {"./snippets/demo.html": "./dist/demo.html"}}))
    if(url.endsWith("/dist/demo.html")) return new Response("<p>Demo</p>")
    if(url.endsWith("/README.md")) return new Response("# Git package")
    return new Response("Missing", {status: 404})
  })
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}

afterEach(() => {vi.unstubAllGlobals(); localStorage.clear()})

describe("Git developer packages", () => {
  it("removes a Git package and its saved source so it is not restored", async () => {
    mockGit()
    const options = callbacks()
    const manager = new LocalPackageManager(options)
    const record = await manager.loadGit(source)
    await manager.remove(record.id)
    expect(manager.records.size).toBe(0)
    expect(record.enabled).toBe(false)
    expect(readGitPackageSources()).toEqual([])
    expect(options.changed).toHaveBeenLastCalledWith([])
    expect(await new LocalPackageManager(callbacks()).restore()).toEqual([])
  })

  it("does not restore a removed package when an in-flight refresh finishes", async () => {
    const fetcher = mockGit()
    const options = callbacks()
    const manager = new LocalPackageManager(options)
    const record = await manager.loadGit(source)
    options.install.mockClear()
    let complete!: (response: Response) => void
    fetcher.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const refresh = manager.refresh(record.id, true)
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"))
    await manager.remove(record.id)
    complete(new Response(JSON.stringify({id: "late", source, commit: "late", baseUrl: `${apiUrl}/late/`})))
    await refresh
    expect(manager.records.size).toBe(0)
    expect(readGitPackageSources()).toEqual([])
    expect(options.install).not.toHaveBeenCalled()
  })

  it("loads through the existing package loader, persists only descriptors and prevents writes", async () => {
    const fetcher = mockGit()
    const options = callbacks()
    const manager = new LocalPackageManager(options)
    const record = await manager.loadGit(source)
    expect(record.package).toMatchObject({name: "@git/demo", version: "1.0.1", developerSource: {kind: "git", ...source, commit: "commit-1"}})
    expect(record.package.members[0].htmlUrl).toBe(`${apiUrl}/snapshot-1/dist/demo.html`)
    expect(record.monitor).toBeUndefined()
    expect(options.install).toHaveBeenCalledWith(record.package, undefined)
    expect(readGitPackageSources()).toEqual([{id: record.id, source}])
    const serialized = localStorage.getItem("webwriter-developer-git-packages")!
    expect(serialized).not.toContain("snapshot-1")
    expect(serialized).not.toContain("<p>Demo</p>")
    expect(serialized).not.toContain("manifest")
    const update = vi.fn()
    await expect(manager.updateManifest(record, update)).rejects.toThrow("read-only")
    expect(update).not.toHaveBeenCalled()
    expect((await manager.readPackageReadme(record.package)).status).toBe("available")
    expect(fetcher.mock.calls.every(([, init]) => init?.cache === "no-store" && init.credentials === "omit")).toBe(true)
  })

  it.each([false, true])("reports refresh progress through installation and clears it on failure (manual: %s)", async manual => {
    const fetcher = mockGit()
    const refreshing = vi.fn()
    const options = {...callbacks(), refreshing}
    const manager = new LocalPackageManager(options)
    const record = await manager.loadGit(source)
    manager.autoReload = !manual
    let completeInstall!: () => void
    options.install.mockImplementationOnce(() => new Promise<void>(resolve => {completeInstall = resolve}))
    const refresh = manager.refresh(record.id, manual)
    await vi.waitFor(() => expect(completeInstall).toBeDefined())
    expect(refreshing).toHaveBeenLastCalledWith([record.package.name])
    completeInstall()
    await refresh
    expect(refreshing).toHaveBeenLastCalledWith([])
    refreshing.mockClear()
    fetcher.mockRejectedValueOnce(new Error("Refresh failed"))
    await manager.refresh(record.id, manual)
    expect(refreshing).toHaveBeenNthCalledWith(1, [record.package.name])
    expect(refreshing).toHaveBeenLastCalledWith([])
    expect(options.error).toHaveBeenLastCalledWith("Refresh failed")
  })

  it("refetches the chosen ref on manual refresh even when auto-reload is off, preserving a working source on failure", async () => {
    const fetcher = mockGit()
    const options = callbacks()
    const manager = new LocalPackageManager(options)
    const first = await manager.loadGit(source)
    manager.autoReload = false
    options.install.mockClear()
    await manager.refresh(first.id, true)
    const next = manager.records.get(first.id)!
    expect(next.package.version).toBe("1.0.2")
    expect(next.package.members[0].htmlUrl).toContain("snapshot-2")
    expect(options.install).toHaveBeenCalledWith(next.package, first.package.name)
    expect(fetcher.mock.calls.filter(([url]) => url === apiUrl).map(([, init]) => JSON.parse(init!.body as string))).toEqual([source, source])
    fetcher.mockRejectedValueOnce(new Error("Remote unavailable"))
    await manager.refresh(first.id, true)
    expect(manager.records.get(first.id)).toBe(next)
    expect(options.error).toHaveBeenLastCalledWith("Remote unavailable")
  })

  it("restores Git sources by fetching again rather than restoring cached package contents", async () => {
    mockGit()
    const first = new LocalPackageManager(callbacks())
    const record = await first.loadGit(source)
    const options = callbacks()
    const restored = new LocalPackageManager(options)
    const packages = await restored.restore()
    expect(packages[0].version).toBe("1.0.2")
    expect(restored.records.get(record.id)?.gitSource).toEqual(source)
    expect(options.install).not.toHaveBeenCalled()
  })

  it("keeps an unavailable saved Git source visible and refreshable", async () => {
    saveGitPackageSources([{id: "saved", source}])
    const fetcher = mockGit()
    fetcher.mockRejectedValueOnce(new Error("Offline"))
    const manager = new LocalPackageManager(callbacks())
    expect(await manager.restore()).toEqual([])
    expect(manager.records.get("saved")?.gitSource).toEqual(source)
    await manager.refresh("saved", true)
    expect(manager.records.get("saved")?.package.name).toBe("@git/demo")
  })

  it("replaces the same package from a different ref without retaining a stale source descriptor", async () => {
    const fetcher = mockGit()
    const manager = new LocalPackageManager(callbacks())
    await manager.loadGit(source)
    const nextSource = {...source, ref: "v2.0.0"}
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({id: "tag-snapshot", source: nextSource, commit: "tag-commit", baseUrl: `${apiUrl}/tag-snapshot/`})))
    const next = await manager.loadGit(nextSource)
    expect(manager.records.size).toBe(1)
    expect(readGitPackageSources()).toEqual([{id: next.id, source: nextSource}])
  })

  it("provides uncached nested file reads without writable handles and rejects traversal", async () => {
    const fetcher = mockGit()
    const snapshot = {baseUrl: `${apiUrl}/snapshot/`}
    const root = gitPackageDirectory(snapshot)
    const nested = await root.getDirectoryHandle!("dist")
    const handle = await nested.getFileHandle("demo.html")
    expect(await (await handle.getFile()).text()).toBe("<p>Demo</p>")
    expect("createWritable" in handle).toBe(false)
    await (await nested.getFileHandle("demo.html")).getFile()
    expect(fetcher).toHaveBeenCalledTimes(2)
    await expect((await root.getFileHandle("missing.js")).getFile()).rejects.toMatchObject({name: "NotFoundError"})
    expect(() => gitPackageUrl(snapshot, "../secret")).toThrow()
    expect(gitPackageUrl(snapshot, "dist/with space.svg")).toContain("with%20space.svg")
  })
})
