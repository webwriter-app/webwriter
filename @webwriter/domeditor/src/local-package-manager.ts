import {loadLocalPackage, localPackageWatchPaths, readLocalPackageReadme, type LocalPackageDirectory, type LocalPackageWarning} from "./local-package"
import {fetchGitPackageSource, gitPackageDirectory, gitPackageUrl, readGitPackageSources, saveGitPackageSources, type GitPackageSnapshot, type GitPackageSource} from "./git-package"
import {LocalPackageMonitor} from "./local-package-monitor"
import {localPackageUrl, type LocalPackageDirectoryHandle} from "./local-package-worker"
import {LocalPackageWorkerClient, requestLocalPackageDirectoryPermission} from "./local-package-worker-client"
import type {PackageDocumentationReadOptions, PackageDocumentationResult, WebWriterPackage} from "./packages"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

export type LocalPackageRecord = {
  id: string
  directory: FileSystemDirectoryHandle | LocalPackageDirectory
  gitSource?: GitPackageSource
  gitSnapshot?: GitPackageSnapshot
  package: WebWriterPackage
  warnings: LocalPackageWarning[]
  revision: number
  enabled: boolean
  monitor?: LocalPackageMonitor
  error?: string
}

const localPackageId = () => globalThis.crypto?.randomUUID?.()
  ?? `package-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const localPackagePlaceholder = (directory: Pick<FileSystemDirectoryHandle, "name">, id: string): WebWriterPackage => ({
  name: `@local/${(directory.name || id).toLowerCase().replaceAll(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || id}`,
  version: "0.0.0",
  label: directory.name || "Local package",
  description: "This local package could not be loaded yet.",
  authors: [],
  keywords: ["local", "development"],
  links: {},
  members: [],
  scripts: [],
  styles: [],
})

type LocalPackageManagerOptions = {
  gitApiUrl?: () => string | Promise<string>
  changed: (packages: WebWriterPackage[]) => void
  refreshing?: (names: string[]) => void
  error: (message: string) => void
  loaded: (record: LocalPackageRecord) => void
  install: (pkg: WebWriterPackage, previousName?: string) => Promise<void>
}

/** Owns developer package sources, restoration and refresh queues independently of
 * the host UI and the editor iframe's reload/selection lifecycle. */
export class LocalPackageManager {
  autoReload = true
  readonly records = new Map<string, LocalPackageRecord>()
  private readonly reloads = new Set<string>()
  private readonly reloadPending = new Set<string>()
  private readonly forcedReloads = new Set<string>()
  private readonly worker = new LocalPackageWorkerClient()
  private active = true
  private readonly gitSources = new Map(readGitPackageSources().map(entry => [entry.id, entry.source]))

  constructor(private readonly options: LocalPackageManagerOptions) {}

  connect() {
    this.active = true
    this.records.forEach(record => void this.watch(record))
  }

  disconnect() {
    this.active = false
    this.records.forEach(record => {
      record.monitor?.dispose()
      record.monitor = undefined
    })
  }

  async remove(id: string) {
    const record = this.records.get(id)
    if(!record) return
    record.enabled = false
    record.monitor?.dispose()
    this.records.delete(id)
    this.reloadPending.delete(id)
    this.forcedReloads.delete(id)
    if(this.gitSources.delete(id)) this.persistGitSources()
    this.publishList()
    if(!record.gitSource) {
      try { await this.worker.unregister(id) }
      catch(error) { this.options.error(error instanceof Error ? error.message : String(error)) }
    }
  }

  private async matching(directory: FileSystemDirectoryHandle) {
    const candidate = directory as FileSystemDirectoryHandle & {
      isSameEntry?: (other: FileSystemHandle) => Promise<boolean>
    }
    if(typeof candidate.isSameEntry !== "function") return undefined
    for(const record of this.records.values()) {
      if(record.gitSource) continue
      try {
        if(await candidate.isSameEntry(record.directory as FileSystemDirectoryHandle)) return record
      }
      catch {
        // An expired handle is not a match; loading the newly-picked handle
        // will surface any current permission problem.
      }
    }
  }

  private publishList() {
    this.options.changed([...this.records.values()].map(record => record.package))
    this.publishRefreshing()
  }

  private publishRefreshing() {
    this.options.refreshing?.([...this.reloads].flatMap(id => {
      const record = this.records.get(id)
      return record ? [record.package.name] : []
    }))
  }

  private replaceName(id: string, name: string) {
    for(const [otherId, other] of this.records) {
      if(otherId === id || other.package.name !== name) continue
      other.monitor?.dispose()
      this.records.delete(otherId)
      this.gitSources.delete(otherId)
      this.persistGitSources()
      if(!other.gitSource) void this.worker.unregister(otherId).catch(() => {
        // The newly selected folder is already registered; stale worker state
        // does not prevent it from becoming the active package with this name.
      })
    }
  }

  private warning(pkg: WebWriterPackage, warnings: LocalPackageWarning[]) {
    if(!warnings.length) return ""
    const missingBundle = warnings.find(warning => warning.code === "missing-bundle")
    return missingBundle
      ? `${pkg.label} has no bundle yet. Build the package to make its exports available.`
      : `${pkg.label}: ${warnings.map(warning => warning.message).join(" ")}`
  }

  async watch(record: LocalPackageRecord) {
    if(!this.active || record.gitSource || this.records.get(record.id) !== record) return
    const paths = localPackageWatchPaths(record.package.manifest)
    if(record.monitor) {
      await record.monitor.setPaths(paths)
      return
    }
    const monitor = new LocalPackageMonitor(record.directory as unknown as LocalPackageDirectory, {
      onChange: () => void this.refresh(record.id),
    })
    record.monitor = monitor
    await monitor.start(paths)
  }

  async refresh(id: string, forceInstall = false) {
    if(forceInstall) this.forcedReloads.add(id)
    if(this.reloads.has(id)) {
      this.reloadPending.add(id)
      return
    }
    this.reloads.add(id)
    this.publishRefreshing()
    try {
      do {
        this.reloadPending.delete(id)
        await this.performRefresh(id, this.forcedReloads.has(id))
      } while(this.reloadPending.has(id))
    }
    finally {
      this.reloadPending.delete(id)
      this.reloads.delete(id)
      this.forcedReloads.delete(id)
      this.publishRefreshing()
    }
  }

  /** Reads the current README from an already-granted local package directory.
   * This intentionally has no cache so README-only edits are visible without a
   * package rebuild or permission prompt. */
  async readPackageReadme(
    summary: Pick<WebWriterPackage, "name" | "version">,
    options: PackageDocumentationReadOptions = {},
  ): Promise<PackageDocumentationResult> {
    const record = [...this.records.values()].find(candidate => (
      candidate.package.name === summary.name && candidate.package.version === summary.version
    ))
    if(!record) return {
      source: "local",
      packageName: summary.name,
      version: summary.version,
      status: "unavailable",
      reason: "not-found",
      message: "This local package is not currently available.",
    }
    return readLocalPackageReadme(record.directory as unknown as LocalPackageDirectory, {
      ...options,
      packageName: record.package.name,
      version: record.package.version,
      localRevision: record.revision,
    })
  }

  private async performRefresh(id: string, forceInstall = false) {
    const previous = this.records.get(id)
    if(!previous) return
    try {
      if(previous.gitSource) {
        await this.loadGit(previous.gitSource, id, forceInstall)
        return
      }
      const revision = previous.revision + 1
      let result: Awaited<ReturnType<typeof loadLocalPackage>>
      try {
        result = await loadLocalPackage(previous.directory as unknown as LocalPackageDirectory, {
          urlFor: path => localPackageUrl(id, path, revision),
          locale: document.documentElement.lang || navigator.language || "en",
        })
      }
      catch(error) {
        if(this.records.get(id) !== previous) return
        previous.error = error instanceof Error ? error.message : String(error)
        this.options.error(`${previous.package.label}: ${previous.error}`)
        await this.watch(previous)
        this.publishList()
        return
      }

      // Build tools often replace the output file rather than updating it in
      // place. Keep the last working package while that short missing-file
      // window is visible, but continue polling/observing for the finished build.
      if(!result.package.members.length && previous.package.members.length) {
        previous.warnings = result.warnings
        previous.error = this.warning(result.package, result.warnings)
        this.options.error(previous.error)
        await this.watch(previous)
        return
      }

      if(this.records.get(id) !== previous) return
      const nextRecord: LocalPackageRecord = {
        ...previous,
        package: {...result.package, developerSource: previous.package.developerSource},
        warnings: result.warnings,
        revision,
        error: undefined,
      }
      this.replaceName(id, result.package.name)
      this.records.set(id, nextRecord)
      this.publishList()
      await this.watch(nextRecord)
      this.options.error(this.warning(result.package, result.warnings))

      if(this.active && this.records.get(id) === nextRecord && nextRecord.enabled && (this.autoReload || forceInstall) && result.package.members.length) {
        await this.options.install(nextRecord.package, previous.package.name)
      }
    }
    catch(error) {
      this.options.error(error instanceof Error ? error.message : String(error))
    }
  }

  async load(directory: FileSystemDirectoryHandle) {
    const previous = await this.matching(directory)
    const id = previous?.id ?? localPackageId()
    await this.worker.start()
    await this.worker.register(id, directory as unknown as LocalPackageDirectoryHandle)

    const revision = (previous?.revision ?? -1) + 1
    let loaded: Awaited<ReturnType<typeof loadLocalPackage>>
    try {
      loaded = await loadLocalPackage(directory as unknown as LocalPackageDirectory, {
        urlFor: path => localPackageUrl(id, path, revision),
        locale: document.documentElement.lang || navigator.language || "en",
      })
    }
    catch(error) {
      const pkg = previous?.package ?? {...localPackagePlaceholder(directory, id), developerSource: {kind: "local" as const, path: directory.name}}
      const record: LocalPackageRecord = {
        id,
        directory,
        package: pkg,
        warnings: previous?.warnings ?? [],
        revision,
        enabled: true,
        monitor: previous?.monitor,
        error: error instanceof Error ? error.message : String(error),
      }
      this.records.set(id, record)
      this.publishList()
      await this.watch(record)
      this.options.loaded(record)
      this.options.error(`${pkg.label}: ${record.error}`)
      return record
    }

    loaded.package.developerSource = {kind: "local", path: directory.name}
    const record: LocalPackageRecord = {
      id,
      directory,
      package: loaded.package,
      warnings: loaded.warnings,
      revision,
      enabled: true,
      monitor: previous?.monitor,
    }
    this.replaceName(id, loaded.package.name)
    this.records.set(id, record)
    this.publishList()
    await this.watch(record)
    this.options.loaded(record)
    this.options.error(this.warning(loaded.package, loaded.warnings))

    if(this.active && loaded.package.members.length) {
      await this.options.install(loaded.package, previous?.package.name)
    }
    return record
  }

  private persistGitSources() {
    saveGitPackageSources([...this.gitSources].map(([id, source]) => ({id, source})))
  }

  async loadGit(source: GitPackageSource, existingId?: string, forceInstall = true, install = true) {
    const previous = existingId ? this.records.get(existingId) : [...this.records.values()].find(record => {
      const saved = record.gitSource
      return saved && saved.repository === source.repository && saved.ref === source.ref && saved.path === source.path
    })
    const id = existingId ?? previous?.id ?? localPackageId()
    const snapshot = await fetchGitPackageSource(source, await this.options.gitApiUrl?.() ?? new URL("/api/developer-packages/git", location.href).href)
    const directory = gitPackageDirectory(snapshot)
    const loaded = await loadLocalPackage(directory, {
      urlFor: path => gitPackageUrl(snapshot, path),
      locale: document.documentElement.lang || navigator.language || "en",
    })
    loaded.package.developerSource = {kind: "git", ...snapshot.source, commit: snapshot.commit}
    if(previous && this.records.get(id) !== previous) return previous
    const record: LocalPackageRecord = {id, directory, gitSource: snapshot.source, gitSnapshot: snapshot, package: loaded.package,
      warnings: loaded.warnings, revision: (previous?.revision ?? -1) + 1, enabled: previous?.enabled ?? true}
    previous?.monitor?.dispose()
    this.replaceName(id, record.package.name)
    this.records.set(id, record)
    this.gitSources.set(id, snapshot.source)
    this.persistGitSources()
    this.publishList()
    if(!existingId) this.options.loaded(record)
    this.options.error(this.warning(record.package, record.warnings))
    if(install && this.active && record.enabled && (forceInstall || this.autoReload) && record.package.members.length) {
      await this.options.install(record.package, previous?.package.name)
    }
    return record
  }

  async restore() {
    const restoredGit: WebWriterPackage[] = []
    for(const [id, source] of this.gitSources) {
      if(this.records.has(id)) continue
      try {restoredGit.push((await this.loadGit(source, id, false, false)).package)}
      catch(error) {
        const name = new URL(source.repository).pathname.split("/").filter(Boolean).at(-1)?.replace(/\.git$/, "") || id
        const pkg = {...localPackagePlaceholder({name}, id), developerSource: {kind: "git" as const, ...source, commit: ""}}
        const message = error instanceof Error ? error.message : String(error)
        this.records.set(id, {id, gitSource: source, directory: {async getFileHandle() {throw new Error(message)}},
          package: pkg, warnings: [], revision: 0, enabled: true, error: message})
        this.options.error(message)
      }
    }
    this.publishList()
    const worker = this.worker as LocalPackageWorkerClient & {
      storedDirectories?: () => Promise<Array<{id: string, handle: LocalPackageDirectoryHandle}>>
    }
    if(!worker.storedDirectories) return restoredGit
    try {
      const stored = await worker.storedDirectories()
      if(stored.length) await worker.start()
      const restored = new Map(restoredGit.map(pkg => [pkg.name, pkg]))
      for(const entry of stored) {
        if(this.records.has(entry.id)) continue
        try {
          if(!await requestLocalPackageDirectoryPermission(entry.handle)) {
            throw new Error("Permission to read this package folder was denied. Grant access to the saved folder to continue.")
          }
          const result = await loadLocalPackage(entry.handle as unknown as LocalPackageDirectory, {
            urlFor: path => localPackageUrl(entry.id, path, 0),
            locale: document.documentElement.lang || navigator.language || "en",
          })
          result.package.developerSource = {kind: "local", path: (entry.handle as FileSystemDirectoryHandle).name}
          const record: LocalPackageRecord = {
            id: entry.id,
            directory: entry.handle as unknown as FileSystemDirectoryHandle,
            package: result.package,
            warnings: result.warnings,
            revision: 0,
            enabled: true,
          }
          this.replaceName(entry.id, result.package.name)
          this.records.set(entry.id, record)
          restored.set(result.package.name, result.package)
          await this.watch(record)
        }
        catch(error) {
          const placeholder = localPackagePlaceholder(entry.handle as unknown as FileSystemDirectoryHandle, entry.id)
          const record: LocalPackageRecord = {
            id: entry.id,
            directory: entry.handle as unknown as FileSystemDirectoryHandle,
            package: placeholder,
            warnings: [],
            revision: 0,
            enabled: true,
            error: error instanceof Error ? error.message : String(error),
          }
          this.records.set(entry.id, record)
          this.options.error(`${placeholder.label}: ${record.error}`)
          await this.watch(record)
        }
      }
      this.publishList()
      return [...restored.values()]
    }
    catch(error) {
      this.options.error(error instanceof Error ? error.message : String(error))
    }
    return restoredGit
  }

  async updateManifest(
    record: LocalPackageRecord,
    update: (manifest: Record<string, unknown>) => void,
  ) {
    if(record.gitSource) throw new Error("Git package contents are read-only. Edit the repository and refresh the package.")
    const directory = record.directory as FileSystemDirectoryHandle & {getFileHandle(name: string, options?: {create?: boolean}): Promise<any>}
    const handle = await directory.getFileHandle("package.json")
    const file = await handle.getFile()
    const parsed: unknown = JSON.parse(await file.text())
    if(!isRecord(parsed)) throw new Error("The local package.json must contain a JSON object")
    const manifest = {...parsed}
    update(manifest)
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(manifest, null, 2) + "\n")
    await writable.close()
    await this.refresh(record.id)
    return this.records.get(record.id)
  }
}
