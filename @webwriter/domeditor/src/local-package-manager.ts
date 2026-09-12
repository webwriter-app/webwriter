import {loadLocalPackage, localPackageWatchPaths, readLocalPackageReadme, type LocalPackageDirectory, type LocalPackageWarning} from "./local-package"
import {LocalPackageMonitor} from "./local-package-monitor"
import {localPackageUrl, type LocalPackageDirectoryHandle} from "./local-package-worker"
import {LocalPackageWorkerClient, requestLocalPackageDirectoryPermission} from "./local-package-worker-client"
import type {PackageDocumentationReadOptions, PackageDocumentationResult, WebWriterPackage} from "./packages"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

export type LocalPackageRecord = {
  id: string
  directory: FileSystemDirectoryHandle
  package: WebWriterPackage
  warnings: LocalPackageWarning[]
  revision: number
  enabled: boolean
  monitor?: LocalPackageMonitor
  error?: string
  autoReload: boolean
}

const localPackageId = () => globalThis.crypto?.randomUUID?.()
  ?? `package-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const localPackagePlaceholder = (directory: FileSystemDirectoryHandle, id: string): WebWriterPackage => ({
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
  changed: (packages: WebWriterPackage[]) => void
  error: (message: string) => void
  loaded: (record: LocalPackageRecord) => void
  install: (pkg: WebWriterPackage, previousName?: string) => Promise<void>
}

/** Owns local folder records, restoration and refresh queues independently of
 * the host UI and the editor iframe's reload/selection lifecycle. */
export class LocalPackageManager {
  readonly records = new Map<string, LocalPackageRecord>()
  private readonly reloads = new Set<string>()
  private readonly reloadPending = new Set<string>()
  private readonly worker = new LocalPackageWorkerClient()
  private active = true

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

  private async matching(directory: FileSystemDirectoryHandle) {
    const candidate = directory as FileSystemDirectoryHandle & {
      isSameEntry?: (other: FileSystemHandle) => Promise<boolean>
    }
    if(typeof candidate.isSameEntry !== "function") return undefined
    for(const record of this.records.values()) {
      try {
        if(await candidate.isSameEntry(record.directory)) return record
      }
      catch {
        // An expired handle is not a match; loading the newly-picked handle
        // will surface any current permission problem.
      }
    }
  }

  private publishList() {
    this.options.changed([...this.records.values()].map(record => record.package))
  }

  private replaceName(id: string, name: string) {
    for(const [otherId, other] of this.records) {
      if(otherId === id || other.package.name !== name) continue
      other.monitor?.dispose()
      this.records.delete(otherId)
      void this.worker.unregister(otherId).catch(() => {
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
    if(!this.active) return
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

  async refresh(id: string) {
    if(this.reloads.has(id)) {
      this.reloadPending.add(id)
      return
    }
    this.reloads.add(id)
    try {
      do {
        this.reloadPending.delete(id)
        await this.performRefresh(id)
      } while(this.reloadPending.has(id))
    }
    finally {
      this.reloadPending.delete(id)
      this.reloads.delete(id)
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

  private async performRefresh(id: string) {
    const previous = this.records.get(id)
    if(!previous) return
    try {
      const revision = previous.revision + 1
      let result: Awaited<ReturnType<typeof loadLocalPackage>>
      try {
        result = await loadLocalPackage(previous.directory as unknown as LocalPackageDirectory, {
          urlFor: path => localPackageUrl(id, path, revision),
          locale: document.documentElement.lang || navigator.language || "en",
        })
      }
      catch(error) {
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

      const nextRecord: LocalPackageRecord = {
        ...previous,
        package: result.package,
        warnings: result.warnings,
        revision,
        error: undefined,
      }
      this.replaceName(id, result.package.name)
      this.records.set(id, nextRecord)
      this.publishList()
      await this.watch(nextRecord)
      this.options.error(this.warning(result.package, result.warnings))

      if(this.active && nextRecord.enabled && nextRecord.autoReload && result.package.members.length) {
        await this.options.install(result.package, previous.package.name)
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
      const pkg = previous?.package ?? localPackagePlaceholder(directory, id)
      const record: LocalPackageRecord = {
        id,
        directory,
        package: pkg,
        warnings: previous?.warnings ?? [],
        revision,
        enabled: true,
        monitor: previous?.monitor,
        error: error instanceof Error ? error.message : String(error),
        autoReload: previous?.autoReload ?? true,
      }
      this.records.set(id, record)
      this.publishList()
      await this.watch(record)
      this.options.loaded(record)
      this.options.error(`${pkg.label}: ${record.error}`)
      return record
    }

    const record: LocalPackageRecord = {
      id,
      directory,
      package: loaded.package,
      warnings: loaded.warnings,
      revision,
      enabled: true,
      monitor: previous?.monitor,
      autoReload: previous?.autoReload ?? true,
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

  async restore() {
    const worker = this.worker as LocalPackageWorkerClient & {
      storedDirectories?: () => Promise<Array<{id: string, handle: LocalPackageDirectoryHandle}>>
    }
    if(!worker.storedDirectories) return []
    try {
      const stored = await worker.storedDirectories()
      if(stored.length) await worker.start()
      const restored = new Map<string, WebWriterPackage>()
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
          const record: LocalPackageRecord = {
            id: entry.id,
            directory: entry.handle as unknown as FileSystemDirectoryHandle,
            package: result.package,
            warnings: result.warnings,
            revision: 0,
            enabled: true,
            autoReload: true,
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
            autoReload: true,
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
    return []
  }

  async updateManifest(
    record: LocalPackageRecord,
    update: (manifest: Record<string, unknown>) => void,
  ) {
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
