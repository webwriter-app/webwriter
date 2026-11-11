import {inlineMediaHTML} from "./serialization-primitives"

export type DocumentRecovery = {id: string, title: string, updatedAt: number, documentKey?: string}

const databaseName = "webwriter-document-recovery"
const documentsStore = "documents", metadataStore = "metadata", assetsStore = "assets"
const discardedPrefix = "webwriter-document-recovery-discarded:"
type StoredDocument = {id: string, parts: string[], assetDigests: string[]}
type StoredAsset = {digest: string, url: string}
type RecoveryWrite = {record: DocumentRecovery, replacedIds: string[]}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if(!globalThis.indexedDB) { reject(new Error("IndexedDB is unavailable for document recovery")); return }
    const request = indexedDB.open(databaseName, 2)
    let blocked = false
    request.onupgradeneeded = ({oldVersion}) => {
      const db = request.result
      if(!db.objectStoreNames.contains(documentsStore)) {
        const documents = db.createObjectStore(documentsStore, {keyPath: "id"})
        documents.createIndex("assetDigests", "assetDigests", {multiEntry: true})
      }
      if(!db.objectStoreNames.contains(metadataStore)) db.createObjectStore(metadataStore, {keyPath: "id"})
      if(!db.objectStoreNames.contains(assetsStore)) db.createObjectStore(assetsStore, {keyPath: "digest"})
      if(oldVersion === 1) identifyLegacyRecoveries(request.transaction!)
    }
    request.onsuccess = () => { if(blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => reject(request.error ?? new Error("Could not open document recovery storage"))
    request.onblocked = () => { blocked = true; reject(new Error("Document recovery storage is blocked")) }
  })
}

/** Recovery captures begin with the serialized document element, after an optional doctype. */
function htmlDocumentKey(html: string) {
  const openingTag = html.match(/^(?:<!doctype(?:[^>"']|"[^"]*"|'[^']*')*>\s*)?(<html(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>)/i)?.[1]
  if(!openingTag) return undefined
  const id = new DOMParser().parseFromString(openingTag, "text/html").documentElement.id
  if(/^ww[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return "html:" + id
}

function removeUnreferencedAssets(tx: IDBTransaction, digests: Iterable<string>) {
  const references = tx.objectStore(documentsStore).index("assetDigests")
  const assets = tx.objectStore(assetsStore)
  for(const digest of new Set(digests)) {
    const count = references.count(digest)
    count.onsuccess = () => { if(count.result === 0) assets.delete(digest) }
  }
}

function removeRecovery(tx: IDBTransaction, id: string) {
  const documents = tx.objectStore(documentsStore), request = documents.get(id)
  request.onsuccess = () => {
    const previous = request.result as StoredDocument | undefined
    documents.delete(id)
    tx.objectStore(metadataStore).delete(id)
    removeUnreferencedAssets(tx, previous?.assetDigests ?? [])
  }
}

/** Older drafts carry no source reference. Merge only those with a generated HTML identity. */
function identifyLegacyRecoveries(tx: IDBTransaction) {
  const metadata = tx.objectStore(metadataStore), documents = tx.objectStore(documentsStore)
  const latest = new Map<string, DocumentRecovery>()
  const request = metadata.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if(!cursor) return
    const record = cursor.value as DocumentRecovery
    if(isDocumentRecoveryDiscarded(record.id)) { cursor.continue(); return }
    const stored = documents.get(record.id)
    stored.onsuccess = () => {
      const documentKey = htmlDocumentKey((stored.result as StoredDocument | undefined)?.parts.join("") ?? "")
      if(documentKey) {
        const previous = latest.get(documentKey)
        if(previous && previous.updatedAt > record.updatedAt) removeRecovery(tx, record.id)
        else {
          if(previous) removeRecovery(tx, previous.id)
          const identified = {...record, documentKey}
          latest.set(documentKey, identified)
          cursor.update(identified)
        }
      }
      cursor.continue()
    }
  }
}

function transaction(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  if(mode === "readonly") return db.transaction(stores, mode)
  try { return db.transaction(stores, mode, {durability: "strict"}) }
  catch { return db.transaction(stores, mode) }
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Could not write document recovery data"))
  })
}

/** The page may be torn down before an IndexedDB transaction can finish. */
export function markDocumentRecoveryDiscarded(id: string) {
  localStorage.setItem(discardedPrefix + id, "1")
}

function isDocumentRecoveryDiscarded(id: string) {
  try { return localStorage.getItem(discardedPrefix + id) === "1" }
  catch { return false }
}

export function discardedDocumentRecoveryIds() {
  try {
    const ids = new Set<string>()
    for(let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if(key?.startsWith(discardedPrefix)) ids.add(key.slice(discardedPrefix.length))
    }
    return ids
  }
  catch { return new Set<string>() }
}

function splitHTML(html: string): {parts: string[], urls: string[]} {
  const parts: string[] = [], urls: string[] = []
  let offset = 0
  for(const {url, offset: index} of inlineMediaHTML(html)) {
    parts.push(html.slice(offset, index))
    urls.push(url)
    offset = index + url.length
  }
  parts.push(html.slice(offset))
  return {parts, urls}
}

async function digestURL(url: string): Promise<string> {
  if(!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") throw new Error("SHA-256 is unavailable for document recovery")
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

/** Atomically keeps the latest snapshot per document and deduplicates inline media. */
export async function writeDocumentRecovery(record: DocumentRecovery, html: string): Promise<RecoveryWrite | null> {
  const htmlKey = htmlDocumentKey(html)
  const documentKey = record.documentKey ?? htmlKey
  const snapshot = documentKey ? {...record, documentKey} : record
  const {parts, urls} = splitHTML(html)
  const digests = new Map(await Promise.all([...new Set(urls)].map(async url => [url, await digestURL(url)] as const)))
  const assetDigests = urls.map(url => digests.get(url)!)
  const db = await openDatabase()
  try {
    const tx = transaction(db, [documentsStore, metadataStore, assetsStore], "readwrite"), completion = done(tx)
    const documents = tx.objectStore(documentsStore), assets = tx.objectStore(assetsStore), metadata = tx.objectStore(metadataStore)
    const outcome: {saved?: RecoveryWrite} = {}
    const records = metadata.getAll()
    records.onsuccess = () => {
      if(isDocumentRecoveryDiscarded(record.id)) return
      const replaced = (records.result as DocumentRecovery[]).filter(candidate => candidate.id !== record.id
        && candidate.documentKey && (candidate.documentKey === documentKey || candidate.documentKey === htmlKey))
      if(replaced.some(candidate => candidate.updatedAt > record.updatedAt && !isDocumentRecoveryDiscarded(candidate.id))) return
      const previousRequest = documents.get(record.id)
      previousRequest.onsuccess = () => {
        if(isDocumentRecoveryDiscarded(record.id)) return
        const previous = previousRequest.result as StoredDocument | undefined
        documents.put({id: record.id, parts, assetDigests} satisfies StoredDocument)
        metadata.put(snapshot)
        const previousDigests = new Set(previous?.assetDigests)
        for(const [url, digest] of digests) {
          if(previousDigests.has(digest)) continue
          const cached = assets.getKey(digest)
          cached.onsuccess = () => { if(cached.result === undefined) assets.put({digest, url} satisfies StoredAsset) }
        }
        removeUnreferencedAssets(tx, [...previousDigests].filter(digest => !assetDigests.includes(digest)))
        const replacedIds = replaced.map(candidate => candidate.id)
        for(const id of replacedIds) removeRecovery(tx, id)
        outcome.saved = {record: snapshot, replacedIds}
      }
    }
    await completion
    return outcome.saved ?? null
  }
  finally { db.close() }
}

export async function listDocumentRecoveries(): Promise<DocumentRecovery[]> {
  const db = await openDatabase()
  try {
    const tx = transaction(db, [metadataStore], "readonly"), completion = done(tx)
    const request = tx.objectStore(metadataStore).getAll()
    const result = new Promise<DocumentRecovery[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as DocumentRecovery[]).filter(record => record && typeof record.id === "string" && typeof record.title === "string" && Number.isFinite(record.updatedAt)))
      request.onerror = () => reject(request.error ?? new Error("Could not list document recoveries"))
    })
    const [records] = await Promise.all([result, completion])
    return records.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  finally { db.close() }
}

export async function readDocumentRecovery(id: string): Promise<string> {
  if(isDocumentRecoveryDiscarded(id)) throw new Error("Document recovery was discarded")
  const db = await openDatabase()
  try {
    const tx = transaction(db, [documentsStore, assetsStore], "readonly"), completion = done(tx)
    const documentRequest = tx.objectStore(documentsStore).get(id)
    const result = new Promise<string>((resolve, reject) => {
      documentRequest.onsuccess = () => {
        const doc = documentRequest.result as StoredDocument | undefined
        if(!doc) { reject(new Error("Document recovery was not found")); return }
        const requests = [...new Set(doc.assetDigests)].map(digest => new Promise<[string, string]>((resolve, reject) => {
          const request = tx.objectStore(assetsStore).get(digest)
          request.onsuccess = () => {
            const asset = request.result as StoredAsset | undefined
            if(asset) resolve([digest, asset.url])
            else reject(new Error("Document recovery media is missing"))
          }
          request.onerror = () => reject(request.error ?? new Error("Could not read document recovery media"))
        }))
        void Promise.all(requests).then(entries => {
          const urls = new Map(entries)
          resolve(doc.parts.map((part, index) => part + (urls.get(doc.assetDigests[index]) ?? "")).join(""))
        }, reject)
      }
      documentRequest.onerror = () => reject(documentRequest.error ?? new Error("Could not read document recovery"))
    })
    const [html] = await Promise.all([result, completion])
    return html
  }
  finally { db.close() }
}

export async function deleteDocumentRecovery(id: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  const db = await openDatabase()
  try {
    signal?.throwIfAborted()
    const tx = transaction(db, [documentsStore, metadataStore, assetsStore], "readwrite"), completion = done(tx)
    const abort = () => {
      try { tx.abort() }
      catch(error) { if(!(error instanceof DOMException && error.name === "InvalidStateError")) throw error }
    }
    signal?.addEventListener("abort", abort, {once: true})
    removeRecovery(tx, id)
    try { await completion }
    finally { signal?.removeEventListener("abort", abort) }
    try { localStorage.removeItem(discardedPrefix + id) }
    catch { /* The draft was deleted from IndexedDB. */ }
  }
  finally { db.close() }
}
