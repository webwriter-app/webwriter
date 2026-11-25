import {loadLocalPackage, localPackageWatchPaths, readLocalPackageReadme, type LocalPackageDirectory, type LocalPackageWarning} from "./local-package"
import {LocalPackageMonitor} from "./local-package-monitor"
import {localPackageUrl, type LocalPackageDirectoryHandle} from "./local-package-worker"
import {LocalPackageWorkerClient} from "./local-package-worker-client"
import type {PackageDocumentationReadOptions, PackageDocumentationResult, WebWriterPackage} from "./packages"

export type LocalPackageRecord = {
  id: string
  directory: FileSystemDirectoryHandle | LocalPackageDirectory
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

const folderPermissionMessage = "Folder access is unavailable. Click Refresh to grant access to this folder."

const isPermissionError = (error: unknown) => Boolean(error && typeof error === "object"
  && (["NotAllowedError", "SecurityError"].includes((error as {name?: string}).name ?? "")
    || (error instanceof Error && /permission to read this package folder was denied/i.test(error.message))))

type LocalPackageManagerOptions = {
  changed: (packages: WebWriterPackage[]) => void
  error: (message: string) => void
  loaded: (record: LocalPackageRecord) => void
  install: (pkg: WebWriterPackage, previousName?: string) => Promise<void>
}

/** Owns developer package sources, restoration and refresh queues independently of
 * the host UI and the editor iframe's reload/selection lifecycle. */
export class LocalPackageManager {
  autoReload = true
  readonly records = new Map<string, LocalPackageRecord>()
  private readonly reloads = new Map<string, Promise<void>>()
  private readonly reloadPending = new Set<string>()
  private readonly forcedReloads = new Set<string>()
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

  async remove(id: string) {
    const record = this.records.get(id)
    if(!record) return
    record.enabled = false
    record.monitor?.dispose()
    this.records.delete(id)
    this.reloadPending.delete(id)
    this.forcedReloads.delete(id)
    this.publishList()
    try { await this.worker.unregister(id) }
    catch(error) { this.options.error(error instanceof Error ? error.message : String(error)) }
  }

  private async matching(directory: FileSystemDirectoryHandle) {
    const candidate = directory as FileSystemDirectoryHandle & {
      isSameEntry?: (other: FileSystemHandle) => Promise<boolean>
    }
    if(typeof candidate.isSameEntry !== "function") return undefined
    for(const record of this.records.values()) {
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
    if(!this.active || this.records.get(record.id) !== record) return
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

  async refreshAll() {
    // Request each folder's permission before the click's user activation expires.
    const sources = [...this.records.values()].map(record => ({
      id: record.id,
      permission: this.requestRefreshPermission(record),
    }))
    const issues: string[] = []
    for(const {id, permission} of sources) {
      if(await permission) await this.queueRefresh(id, true)
      const record = this.records.get(id)
      if(record?.error) issues.push(`${record.package.label}: ${record.error}`)
    }
    this.options.error(issues.join("\n"))
  }

  private async requestRefreshPermission(record: LocalPackageRecord) {
    const directory = record.directory as LocalPackageDirectoryHandle
    if(typeof directory.requestPermission !== "function") return true
    try {
      if(await directory.requestPermission({mode: "readwrite"}) === "granted") return true
    }
    catch {
      // Browsers can deny a stale handle or a dismissed permission prompt.
    }
    if(this.records.get(record.id) === record) {
      record.error = folderPermissionMessage
      this.options.error(`${record.package.label}: ${folderPermissionMessage}`)
      this.publishList()
    }
    return false
  }

  async refresh(id: string) {
    await this.queueRefresh(id, false)
  }

  private async queueRefresh(id: string, forceInstall: boolean) {
    if(!this.records.has(id)) return
    if(forceInstall) this.forcedReloads.add(id)
    const existing = this.reloads.get(id)
    if(existing) {
      this.reloadPending.add(id)
      return existing
    }
    // Defer work until the shared promise is registered for this folder.
    const reload = Promise.resolve().then(async () => {
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
      }
    })
    this.reloads.set(id, reload)
    return reload
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
      // A restored folder remains available for recovery even if its worker
      // failed to start. A manual refresh must retry that setup as well.
      if(forceInstall) await this.worker.start()
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
        previous.error = isPermissionError(error) ? folderPermissionMessage : error instanceof Error ? error.message : String(error)
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
      const record = this.records.get(id)
      if(record) record.error = error instanceof Error ? error.message : String(error)
      if(record) this.options.error(`${record.package.label}: ${record.error}`)
    }
  }

  async load(directory: FileSystemDirectoryHandle, install = this.options.install) {
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
      await install(loaded.package, previous?.package.name)
    }
    return record
  }

  private async readRestoredPackage(id: string, directory: LocalPackageDirectoryHandle) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          if(typeof directory.queryPermission === "function"
            && await directory.queryPermission({mode: "read"}) !== "granted") throw new Error(folderPermissionMessage)
          return await loadLocalPackage(directory as unknown as LocalPackageDirectory, {
            urlFor: path => localPackageUrl(id, path, 0),
            locale: document.documentElement.lang || navigator.language || "en",
          })
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Reading this package folder timed out. Click Refresh to retry or add the folder again.")), 5000)
        }),
      ])
    }
    finally { clearTimeout(timer) }
  }

  async restore() {
    const worker = this.worker as LocalPackageWorkerClient & {
      storedDirectories?: () => Promise<Array<{id: string, handle: LocalPackageDirectoryHandle}>>
    }
    if(!worker.storedDirectories) return []
    try {
      const stored = await worker.storedDirectories()
      let workerError: Error | undefined
      if(stored.length) {
        try { await worker.start() }
        catch(error) { workerError = error instanceof Error ? error : new Error(String(error)) }
      }
      const restored = new Map<string, WebWriterPackage>()
      // Stale handles can leave Chrome's permission or file reads pending.
      // Restore sources independently so one folder cannot hide every package.
      await Promise.all(stored.map(async entry => {
        if(this.records.has(entry.id)) return
        try {
          if(workerError) throw workerError
          const result = await this.readRestoredPackage(entry.id, entry.handle)
          if(this.records.has(entry.id)) return
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
          void this.watch(record).catch(error => this.options.error(error instanceof Error ? error.message : String(error)))
        }
        catch(error) {
          if(this.records.has(entry.id)) return
          const placeholder = localPackagePlaceholder(entry.handle as unknown as FileSystemDirectoryHandle, entry.id)
          const record: LocalPackageRecord = {
            id: entry.id,
            directory: entry.handle as unknown as FileSystemDirectoryHandle,
            package: placeholder,
            warnings: [],
            revision: 0,
            enabled: true,
            error: isPermissionError(error) ? folderPermissionMessage : error instanceof Error ? error.message : String(error),
          }
          this.records.set(entry.id, record)
          this.options.error(`${placeholder.label}: ${record.error}`)
        }
        this.publishList()
      }))
      this.publishList()
      return [...restored.values()]
    }
    catch(error) {
      this.options.error(error instanceof Error ? error.message : String(error))
    }
    return []
  }
}
