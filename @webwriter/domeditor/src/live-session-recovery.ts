import * as Y from "yjs"
import type {LiveSession, LiveSessionFeedback, LiveSessionLearner, LiveSessionStep} from "./live-session"
import {captureLiveSessionReplay, type LiveSessionReplay} from "./live-session-replay"

const databaseName = "webwriter-live-recovery"
const sessionsStore = "sessions", batchesStore = "batches"
const lockPrefix = "webwriter-live-recovery:"
const maxPendingBytes = 64 * 1024 * 1024

export type RecoveredSession = {id: string, title: string, startedAt: number, updatedAt: number, finished: boolean, sequence: number, locked?: boolean}
type RecoveryBatch = {id: string, sequence: number, update: Uint8Array, feedback: LiveSessionFeedback[]}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if(!globalThis.indexedDB) { reject(new Error("Local recovery storage is unavailable")); return }
    const request = indexedDB.open(databaseName, 1)
    let settled = false
    request.onupgradeneeded = () => {
      const db = request.result
      if(!db.objectStoreNames.contains(sessionsStore)) db.createObjectStore(sessionsStore, {keyPath: "id"})
      if(!db.objectStoreNames.contains(batchesStore)) {
        const batches = db.createObjectStore(batchesStore, {keyPath: ["id", "sequence"]})
        batches.createIndex("session", "id")
      }
    }
    request.onsuccess = () => { if(settled) request.result.close(); else { settled = true; resolve(request.result) } }
    request.onerror = () => { if(!settled) { settled = true; reject(request.error ?? new Error("Could not open local recovery storage")) } }
    request.onblocked = () => { if(!settled) { settled = true; reject(new Error("Local recovery storage is blocked")) } }
  })
}

function transaction(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  if(mode === "readonly") return db.transaction(stores, mode)
  try { return db.transaction(stores, mode, {durability: "strict"}) }
  catch { return db.transaction(stores, mode) }
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Could not write local recovery data"))
  })
}

/** Journal accepted Yjs updates and private feedback in atomic local batches. */
export class LiveSessionRecovery {
  private readonly db = openDatabase()
  private readonly metadata: RecoveredSession
  private updates: Uint8Array[]
  private feedback: LiveSessionFeedback[] = []
  private readonly knownFeedback = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private writing: Promise<void> = Promise.resolve()
  private failed = false
  private ended = false
  private pendingBytes = 0
  private readonly unsubscribe: () => void
  private releaseLock: (() => void) | undefined
  private lock: Promise<unknown> | undefined

  constructor(private readonly session: LiveSession, startedAt: number, title: string, private readonly onError: (error: Error) => void) {
    void this.db.catch(() => {})
    this.metadata = {id: session.id, title, startedAt, updatedAt: Date.now(), finished: false, sequence: 0}
    this.updates = [Y.encodeStateAsUpdate(session.doc)]
    this.pendingBytes = this.updates[0].byteLength
    session.doc.on("update", this.onUpdate)
    this.unsubscribe = session.onChange(() => this.collectFeedback())
    this.collectFeedback()
    if(this.pendingBytes > maxPendingBytes) this.fail(new Error("Local recovery is falling behind"))
    if(globalThis.navigator?.locks) {
      try { this.lock = navigator.locks.request(lockPrefix + session.id, async () => new Promise<void>(resolve => { this.metadata.locked = true; this.releaseLock = resolve; if(this.ended) resolve() })).catch(() => {}) }
      catch { /* Fall back to the heartbeat when browser locking is unavailable. */ }
    }
    try { void globalThis.navigator?.storage?.persist?.().catch(() => false) }
    catch { /* Recovery remains available as best-effort browser storage. */ }
    this.schedule()
    if(!this.failed) this.heartbeat = setInterval(() => { void this.flush() }, 5000)
  }

  private onUpdate = (update: Uint8Array) => {
    if(this.failed || this.ended) return
    this.pendingBytes += update.byteLength
    if(this.pendingBytes > maxPendingBytes) { this.fail(new Error("Local recovery is falling behind")); return }
    this.updates.push(update.slice()); this.schedule()
  }
  private collectFeedback() {
    if(this.failed) return
    for(const message of this.session.feedback) if(!this.knownFeedback.has(message.id)) {
      this.pendingBytes += message.text.length * 2 + 512
      if(this.pendingBytes > maxPendingBytes) { this.fail(new Error("Local recovery is falling behind")); return }
      this.knownFeedback.add(message.id); this.feedback.push(message)
    }
    if(this.feedback.length) this.schedule()
  }
  private schedule() {
    if(this.timer !== undefined || this.failed || this.ended) return
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush() }, 1000)
  }

  flush(finished = false): Promise<void> {
    if(this.failed) return this.writing
    const updates = this.updates.splice(0), feedback = this.feedback.splice(0)
    const batchBytes = updates.reduce((total, update) => total + update.byteLength, 0)
      + feedback.reduce((total, message) => total + message.text.length * 2 + 512, 0)
    this.writing = this.writing.then(async () => {
      if(this.failed) return
      const db = await this.db
      const tx = transaction(db, [sessionsStore, batchesStore], "readwrite")
      const completion = done(tx)
      const sessions = tx.objectStore(sessionsStore)
      const previous = sessions.get(this.metadata.id)
      previous.onsuccess = () => {
        if(previous.result?.deleted === true) { tx.abort(); return }
        const sequence = this.metadata.sequence
        if(updates.length || feedback.length) {
          const batch: RecoveryBatch = {id: this.metadata.id, sequence, update: updates.length ? Y.mergeUpdates(updates) : new Uint8Array(), feedback}
          tx.objectStore(batchesStore).put(batch)
          this.metadata.sequence++
        }
        this.metadata.updatedAt = Date.now()
        if(finished) this.metadata.finished = true
        sessions.put({...this.metadata})
      }
      await completion
      this.pendingBytes -= batchBytes
    }).catch(error => {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    })
    return this.writing
  }

  private fail(error: Error) {
    if(this.failed) return
    this.failed = true
    this.stopListeners()
    this.updates = []; this.feedback = []
    this.onError(error)
  }

  private stopListeners() {
    if(this.timer !== undefined) clearTimeout(this.timer)
    if(this.heartbeat !== undefined) clearInterval(this.heartbeat)
    this.timer = undefined; this.heartbeat = undefined
    this.session.doc.off("update", this.onUpdate)
    this.unsubscribe()
  }

  async finish() {
    if(this.ended) return this.writing
    this.collectFeedback()
    this.ended = true
    this.stopListeners()
    try { await this.flush(true) }
    finally { this.releaseLock?.(); await this.lock; (await this.db.catch(() => null))?.close() }
  }
}

async function available(record: RecoveredSession) {
  if(!navigator.locks || !record.locked) return record.finished || Date.now() - record.updatedAt > 15000
  try { return await navigator.locks.request(lockPrefix + record.id, {ifAvailable: true}, lock => Boolean(lock)) }
  catch { return record.finished || Date.now() - record.updatedAt > 15000 }
}

export async function listRecoveredSessions(): Promise<RecoveredSession[]> {
  const db = await openDatabase()
  try {
    const tx = transaction(db, [sessionsStore], "readonly"), completion = done(tx)
    const request = tx.objectStore(sessionsStore).getAll()
    const records = await new Promise<RecoveredSession[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await completion
    const valid = records.filter(record => record && typeof record.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.id)
      && typeof record.title === "string" && typeof record.finished === "boolean" && Number.isFinite(record.startedAt)
      && Number.isFinite(record.updatedAt) && Number.isSafeInteger(record.sequence) && record.sequence > 0)
    const status = await Promise.all(valid.map(available))
    return valid.filter((_, i) => status[i]).sort((a, b) => a.startedAt - b.startedAt)
  }
  finally { db.close() }
}

export async function deleteRecoveredSession(id: string) {
  if(globalThis.navigator?.locks) {
    return navigator.locks.request(lockPrefix + id, {ifAvailable: true}, async lock => {
      if(!lock) throw new Error("The recovered session is still active")
      await deleteRecoveryData(id)
    })
  }
  return deleteRecoveryData(id)
}

async function deleteRecoveryData(id: string) {
  const db = await openDatabase()
  try {
    const tx = transaction(db, [sessionsStore, batchesStore], "readwrite"), completion = done(tx)
    // Retain a content-free tombstone so an interrupted tab's late commit
    // cannot recreate a recovery the user has explicitly removed.
    tx.objectStore(sessionsStore).put({id, deleted: true})
    const index = tx.objectStore(batchesStore).index("session")
    const request = index.openKeyCursor(IDBKeyRange.only(id))
    request.onsuccess = () => { const cursor = request.result; if(cursor) { tx.objectStore(batchesStore).delete(cursor.primaryKey); cursor.continue() } }
    await completion
  }
  finally { db.close() }
}

/** Recover the last committed state without rejoining the live session. */
export async function readRecoveredSession(record: RecoveredSession): Promise<LiveSessionReplay> {
  if(globalThis.navigator?.locks) {
    return navigator.locks.request(lockPrefix + record.id, {ifAvailable: true}, async lock => {
      if(!lock) throw new Error("The recovered session is still active")
      return readRecoveryData(record)
    })
  }
  return readRecoveryData(record)
}

async function readRecoveryData(record: RecoveredSession): Promise<LiveSessionReplay> {
  const db = await openDatabase(), doc = new Y.Doc(), feedback: LiveSessionFeedback[] = []
  let sequence = 0
  try {
    const tx = transaction(db, [batchesStore], "readonly"), completion = done(tx)
    void completion.catch(() => {})
    const request = tx.objectStore(batchesStore).index("session").openCursor(IDBKeyRange.only(record.id))
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if(!cursor) { resolve(); return }
        try {
          const batch = cursor.value as RecoveryBatch
          if(batch.sequence >= record.sequence) { resolve(); return }
          if(batch.sequence !== sequence++ || !(batch.update instanceof Uint8Array) || !Array.isArray(batch.feedback)) throw new Error("Recovery data is incomplete")
          if(batch.update?.length) Y.applyUpdate(doc, batch.update)
          feedback.push(...batch.feedback)
          cursor.continue()
        }
        catch(error) { reject(error); tx.abort() }
      }
      request.onerror = () => reject(request.error)
    })
    await completion
    if(sequence !== record.sequence) throw new Error("Recovery data is incomplete")
    if(doc.store.pendingStructs || doc.store.pendingDs) throw new Error("Recovery data is incomplete")
    const meta = doc.getMap("live-session-meta")
    const recovered = {id: record.id, role: "host", status: "stopped", baseHTML: meta.get("baseHTML"), previewDependencies: meta.get("previewDependencies"),
      learners: [...doc.getMap<LiveSessionLearner>("live-session-learners").values()].map(learner => ({...learner, connected: false})),
      steps: doc.getArray<LiveSessionStep>("live-session-steps").toArray(), feedback} as unknown as LiveSession
    return captureLiveSessionReplay(recovered, record.startedAt, Math.max(record.startedAt, record.updatedAt), record.title)
  }
  finally { doc.destroy(); db.close() }
}
