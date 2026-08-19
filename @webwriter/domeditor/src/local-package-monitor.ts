import {normalizeLocalPackagePath, type LocalPackageDirectory, type LocalPackageFile} from "./local-package"

type FileSystemObserverLike = {
  observe(target: LocalPackageDirectory, options?: {recursive?: boolean}): Promise<void> | void
  disconnect(): void
}
type FileSystemObserverConstructor = new (callback: (records: unknown[], observer: FileSystemObserverLike) => void) => FileSystemObserverLike

export type LocalPackageMonitorOptions = {
  onChange: (changedPaths?: string[]) => void
  intervalMs?: number
  debounceMs?: number
  observerFactory?: FileSystemObserverConstructor
}

type FileState = {exists: boolean, lastModified?: number, size?: number}

const observerFromGlobal = () => (globalThis as unknown as {FileSystemObserver?: FileSystemObserverConstructor}).FileSystemObserver

async function readPath(directory: LocalPackageDirectory, path: string): Promise<LocalPackageFile> {
  const parts = normalizeLocalPackagePath(path).split("/")
  if(!parts.length) throw new Error("The package path is empty")
  let current = directory
  for(const part of parts.slice(0, -1)) {
    if(current.getDirectoryHandle) {
      try { current = await current.getDirectoryHandle(part) }
      catch { current = await current.getFileHandle(part) as unknown as LocalPackageDirectory }
    }
    else current = await current.getFileHandle(part) as unknown as LocalPackageDirectory
  }
  return (await current.getFileHandle(parts.at(-1)!)).getFile()
}

async function fileState(directory: LocalPackageDirectory, path: string): Promise<FileState> {
  try {
    const file = await readPath(directory, path) as LocalPackageFile & {lastModified?: number, size?: number}
    return {exists: true, lastModified: file.lastModified, size: file.size}
  }
  catch {
    return {exists: false}
  }
}

const sameState = (left: FileState, right: FileState) => left.exists === right.exists
  && left.lastModified === right.lastModified && left.size === right.size

/** Watches a local package directory and reports debounced bundle changes. */
export class LocalPackageMonitor {
  private observer: FileSystemObserverLike | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private polling = false
  private paths: string[] = []
  private states = new Map<string, FileState>()
  private started = false
  private disposed = false
  private readonly intervalMs: number
  private readonly debounceMs: number
  private readonly observerFactory: FileSystemObserverConstructor | undefined

  constructor(private readonly directory: LocalPackageDirectory, private readonly options: LocalPackageMonitorOptions) {
    this.intervalMs = Math.max(50, options.intervalMs ?? 500)
    this.debounceMs = Math.max(0, options.debounceMs ?? 100)
    this.observerFactory = options.observerFactory ?? observerFromGlobal()
  }

  /** Starts observing once; subsequent calls are harmless. */
  async start(paths: string[] = []) {
    if(this.started || this.disposed) return
    this.started = true
    this.paths = this.normalizePaths(paths)
    await this.captureStates()
    if(this.disposed) return
    if(this.observerFactory) {
      let observer: FileSystemObserverLike | undefined
      try {
        observer = new this.observerFactory(() => this.scheduleChange())
        this.observer = observer
        await observer.observe(this.directory, {recursive: true})
        return
      }
      catch {
        observer?.disconnect()
        this.observer = undefined
      }
    }
    this.startPolling()
  }

  /** Replaces the paths used by polling; newly-created files are detected. */
  async setPaths(paths: string[]) {
    this.paths = this.normalizePaths(paths)
    if(this.started && !this.observer) await this.captureStates()
  }

  private startPolling() {
    if(this.pollTimer || this.disposed) return
    this.pollTimer = setInterval(() => void this.poll(), this.intervalMs)
  }

  private normalizePaths(paths: string[]) {
    return [...new Set(paths.flatMap(path => {
      try { return [normalizeLocalPackagePath(path)] }
      catch { return [] }
    }))]
  }

  private async captureStates() {
    const next = new Map<string, FileState>()
    await Promise.all(this.paths.map(async path => next.set(path, await fileState(this.directory, path))))
    this.states = next
  }

  private async poll() {
    if(this.disposed || this.polling) return
    this.polling = true
    try {
      const previous = this.states
      await this.captureStates()
      const changed = this.paths.filter(path => !sameState(previous.get(path) ?? {exists: false}, this.states.get(path) ?? {exists: false}))
      if(changed.length) this.scheduleChange(changed)
    }
    finally {
      this.polling = false
    }
  }

  private scheduleChange(changedPaths?: string[]) {
    if(this.disposed) return
    const changed = changedPaths ? [...changedPaths] : undefined
    if(this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined
      if(!this.disposed) this.options.onChange(changed)
    }, this.debounceMs)
  }

  stop() {
    if(this.pollTimer) clearInterval(this.pollTimer)
    if(this.debounceTimer) clearTimeout(this.debounceTimer)
    this.pollTimer = undefined
    this.debounceTimer = undefined
    this.observer?.disconnect()
    this.observer = undefined
    this.started = false
  }

  dispose() {
    if(this.disposed) return
    this.disposed = true
    this.stop()
    this.states.clear()
  }
}
