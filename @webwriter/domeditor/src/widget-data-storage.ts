import * as Y from "yjs"

export type WidgetDataPersistenceState = Readonly<{state: "pending" | "saved" | "error", message?: string}>
export type StoredWidgetDataConnection = {
  doc: Y.Doc
  ready?: Promise<void>
  observePersistence: (listener: (state: WidgetDataPersistenceState) => void) => () => void
}
type Entry = {
  key: string
  connection: StoredWidgetDataConnection
  initialize: (doc: Y.Doc) => void
  resolveReady: () => void
  loaded: boolean
  loading?: Promise<void>
  updates: Uint8Array[]
  records: number
  bytes: number
  state: WidgetDataPersistenceState
  listeners: Set<(state: WidgetDataPersistenceState) => void>
  observe: (update: Uint8Array, origin: unknown) => void
}
type Update = {id: number, scope: string, update: Uint8Array}
const databaseName = "webwriter-widget-data"
const stores = ["updates", "checkpoints"]
const compactAfter = 128
const compactBytes = 1024 * 1024
function bytes(value: unknown): Uint8Array {
  if(!ArrayBuffer.isView(value)) throw new TypeError("Invalid persisted widget update")
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

/** One database connection and write queue for an editor's offline widget scopes. */
export class WidgetDataStorage {
  readonly #entries = new Map<string, Entry>()
  #database?: Promise<IDBDatabase>
  #writing?: Promise<void>
  #timer?: ReturnType<typeof setTimeout>
  #scheduledDelay = 0
  #retryDelay = 1000
  #destroyed = false

  constructor(readonly indexedDatabase?: IDBFactory, readonly legacy?: Storage) {}

  connect(key: string, initialize: (doc: Y.Doc) => void): StoredWidgetDataConnection {
    const existing = this.#entries.get(key)
    if(existing) return existing.connection
    const doc = new Y.Doc()
    let resolveReady = () => {}
    const ready = this.indexedDatabase ? new Promise<void>(resolve => { resolveReady = resolve }) : undefined
    const entry: Entry = {
      key, initialize, resolveReady, loaded: !this.indexedDatabase, updates: [], records: 0, bytes: 0,
      state: {state: "pending"}, listeners: new Set(),
      connection: {doc, ready, observePersistence: listener => {
        entry.listeners.add(listener); listener(entry.state)
        return () => entry.listeners.delete(listener)
      }},
      observe: (update, origin) => {
        if(origin === this || this.#destroyed) return
        if(!this.indexedDatabase) { this.#status(entry, this.#unavailable()); return }
        entry.updates.push(update)
        this.#status(entry, {state: "pending"})
        this.#schedule()
      },
    }
    this.#entries.set(key, entry)
    if(this.indexedDatabase) void this.#load(entry).catch(() => {})
    else {
      // Opaque origins still allow in-memory editing and reading legacy state.
      try {
        const stored = this.legacy?.getItem(key)
        if(stored) Y.applyUpdate(doc, Uint8Array.from(JSON.parse(stored)), this)
      }
      catch { /* Keep unavailable legacy storage untouched. */ }
      initialize(doc)
      entry.initialize = () => {}
      this.#status(entry, this.#unavailable())
    }
    doc.on("update", entry.observe)
    return entry.connection
  }

  #unavailable(): WidgetDataPersistenceState {
    return {state: "error", message: "IndexedDB is unavailable; widget changes remain in memory"}
  }

  #status(entry: Entry, state: WidgetDataPersistenceState) {
    if(entry.state.state === state.state && entry.state.message === state.message) return
    entry.state = state
    entry.listeners.forEach(listener => listener(state))
  }

  #open() {
    if(!this.#database) this.#database = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        if(!this.indexedDatabase) throw new Error(this.#unavailable().message)
        const request = this.indexedDatabase.open(databaseName, 1)
        let failed = false
        request.onupgradeneeded = () => {
          const updates = request.result.createObjectStore("updates", {keyPath: "id", autoIncrement: true})
          updates.createIndex("scope", "scope")
          request.result.createObjectStore("checkpoints")
        }
        request.onsuccess = () => {
          if(failed || this.#destroyed) { request.result.close(); reject(new Error("Widget storage was closed")); return }
          request.result.onversionchange = () => { request.result.close(); this.#database = undefined }
          resolve(request.result)
        }
        request.onerror = () => { failed = true; reject(request.error ?? new Error("Cannot open widget storage")) }
        request.onblocked = () => { failed = true; reject(new Error("Widget storage upgrade is blocked by another tab")) }
      }
      catch(error) { reject(error) }
    }).catch(error => { this.#database = undefined; throw error })
    return this.#database
  }

  #load(entry: Entry): Promise<void> {
    if(entry.loaded || this.#destroyed) return Promise.resolve()
    if(entry.loading) return entry.loading
    entry.loading = this.#open().then(database => new Promise<void>((resolve, reject) => {
      if(this.#destroyed) { resolve(); return }
      // A read/write transaction elects one initial value even across tabs.
      const transaction = database.transaction(stores, "readwrite")
      const updates = transaction.objectStore("updates")
      const checkpoint = transaction.objectStore("checkpoints").get(entry.key)
      const records = updates.index("scope").getAll(entry.key)
      const restored = new Y.Doc()
      let legacyText: string | null | undefined, failure: unknown
      records.onsuccess = () => {
        try {
          const stored = records.result as Update[]
          if(checkpoint.result !== undefined) Y.applyUpdate(restored, bytes(checkpoint.result))
          for(const record of stored) Y.applyUpdate(restored, bytes(record.update))
          try { legacyText = this.legacy?.getItem(entry.key) }
          catch { /* IndexedDB can remain usable when localStorage is blocked. */ }
          const empty = checkpoint.result === undefined && !stored.length
          entry.bytes = stored.reduce((size, record) => size + record.update.byteLength, 0)
          if(empty || legacyText) {
            // A legacy tab may have saved again after a previous migration.
            // Merge that snapshot rather than deleting an unmigrated value.
            if(legacyText) Y.applyUpdate(restored, Uint8Array.from(JSON.parse(legacyText)))
            entry.initialize(restored)
            const update = Y.encodeStateAsUpdate(restored)
            updates.add({scope: entry.key, update})
            entry.bytes += update.byteLength
          }
          entry.records = stored.length + Number(empty || Boolean(legacyText))
        }
        catch(error) { failure = error; transaction.abort() }
      }
      transaction.oncomplete = () => {
        try {
          if(!this.#destroyed) {
            Y.applyUpdate(entry.connection.doc, Y.encodeStateAsUpdate(restored), this)
            entry.loaded = true
            entry.initialize = () => {}
            this.#status(entry, {state: "saved"})
            // Only remove the exact snapshot whose migration has committed.
            try { if(legacyText && this.legacy?.getItem(entry.key) === legacyText) this.legacy.removeItem(entry.key) }
            catch { /* Keeping a legacy copy is harmless. */ }
          }
          entry.resolveReady()
          resolve()
        }
        catch(error) { reject(error) }
        finally { restored.destroy() }
      }
      transaction.onabort = () => { restored.destroy(); reject(failure ?? transaction.error ?? new Error("Widget restoration aborted")) }
      transaction.onerror = () => { /* Abort reports the transaction's final outcome. */ }
    })).catch(error => {
      this.#status(entry, {state: "error", message: String(error)})
      this.#retry()
      throw error
    }).finally(() => { entry.loading = undefined })
    return entry.loading
  }

  #retry() {
    if(this.#timer !== undefined || this.#destroyed) return
    this.#schedule(this.#retryDelay)
    this.#retryDelay = Math.min(this.#retryDelay * 2, 30000)
  }

  #schedule(delay = 0) {
    if(this.#destroyed) return
    if(this.#timer !== undefined) {
      // New edits need not wait for an unrelated scope's retry backoff.
      if(delay || !this.#scheduledDelay) return
      clearTimeout(this.#timer)
    }
    this.#scheduledDelay = delay
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      void this.flush().catch(() => this.#retry())
    }, delay)
  }

  /** Resolves after committed transactions, not merely queued requests. */
  async flush(): Promise<void> {
    if(this.#timer !== undefined) { clearTimeout(this.#timer); this.#timer = undefined }
    const restored = await Promise.allSettled([...this.#entries.values()].map(entry => this.#load(entry)))
    const failed = restored.find(result => result.status === "rejected")
    if(this.#writing) { await this.#writing; return this.flush() }
    const pending = [...this.#entries.values()].filter(entry => entry.loaded && entry.updates.length)
    if(!this.indexedDatabase && this.#entries.size) throw new Error(this.#unavailable().message)
    if(!pending.length) {
      if(failed?.status === "rejected") throw failed.reason
      return
    }
    const batches = pending.map(entry => {
      const update = entry.updates.length === 1 ? entry.updates[0] : Y.mergeUpdates(entry.updates)
      return {entry, count: entry.updates.length, update,
        compact: entry.records + 1 >= compactAfter || entry.bytes + update.byteLength >= compactBytes}
    })
    this.#writing = this.#open().then(database => new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(stores, "readwrite")
      const updates = transaction.objectStore("updates"), checkpoints = transaction.objectStore("checkpoints")
      let failure: unknown
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Widget persistence aborted"))
      transaction.onerror = () => { /* Abort reports failure; requests succeeding is not a commit. */ }
      try {
        for(const {entry, update, compact} of batches) {
          updates.add({scope: entry.key, update})
          if(compact) {
            const checkpoint = checkpoints.get(entry.key), records = updates.index("scope").getAll(entry.key)
            records.onsuccess = () => {
              const compacted = new Y.Doc()
              try {
                if(checkpoint.result !== undefined) Y.applyUpdate(compacted, bytes(checkpoint.result))
                for(const record of records.result as Update[]) Y.applyUpdate(compacted, bytes(record.update))
                checkpoints.put(Y.encodeStateAsUpdate(compacted), entry.key)
                for(const record of records.result as Update[]) updates.delete(record.id)
              }
              catch(error) { failure = error; transaction.abort() }
              finally { compacted.destroy() }
            }
          }
        }
      }
      catch(error) { failure = error; transaction.abort() }
    })).then(() => {
      this.#retryDelay = 1000
      for(const {entry, count, update, compact} of batches) {
        entry.updates.splice(0, count)
        entry.records = compact ? 0 : entry.records + 1
        entry.bytes = compact ? 0 : entry.bytes + update.byteLength
        this.#status(entry, {state: entry.updates.length ? "pending" : "saved"})
      }
    }).catch(error => {
      for(const {entry} of batches) this.#status(entry, {state: "error", message: String(error)})
      this.#retry()
      throw error
    }).finally(() => { this.#writing = undefined })
    await this.#writing
    if([...this.#entries.values()].some(entry => entry.updates.length)) return this.flush()
    if(failed?.status === "rejected") throw failed.reason
  }

  destroy() {
    if(this.#destroyed) return
    this.#destroyed = true
    for(const entry of this.#entries.values()) {
      entry.connection.doc.off("update", entry.observe)
      entry.connection.doc.destroy()
      entry.resolveReady()
      entry.listeners.clear()
    }
    // Existing binary updates can finish even after their live Y.Doc is destroyed.
    void this.flush().catch(() => {}).finally(async () => {
      try { (await this.#database)?.close() }
      catch { /* No database was available. */ }
      this.#entries.clear()
    })
  }
}
