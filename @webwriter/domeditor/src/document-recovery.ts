export type DocumentRecovery = {id: string, title: string, updatedAt: number}

const databaseName = "webwriter-document-recovery"
const documentsStore = "documents", metadataStore = "metadata", assetsStore = "assets"
const discardedPrefix = "webwriter-document-recovery-discarded:"
type StoredDocument = {id: string, parts: string[], assetDigests: string[]}
type StoredAsset = {digest: string, url: string}
// Full URL attributes may contain spaces and SVG markup. The other branch
// handles URLs embedded in CSS and comma-separated base64 srcset candidates.
const inlineMedia = /\b(?:src|poster|data|(?:xlink:)?href)\s*=\s*(["'])(data:(?:image|audio|video)\/[\w.+-]+[^\s"',]*,[\s\S]*?)\1|data:(?:image|audio|video)\/[\w.+-]+(?:;(?!base64,)[\w=.+-]+)*(?:;base64,[\da-z+/=]*|,[^\s"'<>)]*)/gi

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if(!globalThis.indexedDB) { reject(new Error("IndexedDB is unavailable for document recovery")); return }
    const request = indexedDB.open(databaseName, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      const db = request.result
      if(!db.objectStoreNames.contains(documentsStore)) {
        const documents = db.createObjectStore(documentsStore, {keyPath: "id"})
        documents.createIndex("assetDigests", "assetDigests", {multiEntry: true})
      }
      if(!db.objectStoreNames.contains(metadataStore)) db.createObjectStore(metadataStore, {keyPath: "id"})
      if(!db.objectStoreNames.contains(assetsStore)) db.createObjectStore(assetsStore, {keyPath: "digest"})
    }
    request.onsuccess = () => { if(blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => reject(request.error ?? new Error("Could not open document recovery storage"))
    request.onblocked = () => { blocked = true; reject(new Error("Document recovery storage is blocked")) }
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
  for(const match of html.matchAll(inlineMedia)) {
    const url = match[2] ?? match[0]
    const index = match.index! + match[0].indexOf(url)
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

/** Atomically replaces a recovery snapshot and stores inline media once by digest across documents. */
export async function writeDocumentRecovery(record: DocumentRecovery, html: string): Promise<void> {
  const {parts, urls} = splitHTML(html)
  const digests = new Map(await Promise.all([...new Set(urls)].map(async url => [url, await digestURL(url)] as const)))
  const assetDigests = urls.map(url => digests.get(url)!)
  const db = await openDatabase()
  try {
    const tx = transaction(db, [documentsStore, metadataStore, assetsStore], "readwrite"), completion = done(tx)
    const documents = tx.objectStore(documentsStore), assets = tx.objectStore(assetsStore)
    const previousRequest = documents.get(record.id)
    previousRequest.onsuccess = () => {
      if(isDocumentRecoveryDiscarded(record.id)) return
      const previous = previousRequest.result as StoredDocument | undefined
      documents.put({id: record.id, parts, assetDigests} satisfies StoredDocument)
      tx.objectStore(metadataStore).put(record)
      const previousDigests = new Set(previous?.assetDigests)
      for(const [url, digest] of digests) {
        if(previousDigests.has(digest)) continue
        const cached = assets.getKey(digest)
        cached.onsuccess = () => { if(cached.result === undefined) assets.put({digest, url} satisfies StoredAsset) }
      }
      for(const digest of previousDigests) {
        if(assetDigests.includes(digest)) continue
        const reference = documents.index("assetDigests").count(digest)
        reference.onsuccess = () => { if(reference.result === 0) assets.delete(digest) }
      }
    }
    await completion
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
    const documents = tx.objectStore(documentsStore), request = documents.get(id)
    request.onsuccess = () => {
      const previous = request.result as StoredDocument | undefined
      documents.delete(id)
      tx.objectStore(metadataStore).delete(id)
      for(const digest of new Set(previous?.assetDigests ?? [])) {
        const references = documents.index("assetDigests").count(digest)
        references.onsuccess = () => { if(references.result === 0) tx.objectStore(assetsStore).delete(digest) }
      }
    }
    try { await completion }
    finally { signal?.removeEventListener("abort", abort) }
    try { localStorage.removeItem(discardedPrefix + id) }
    catch { /* The draft was deleted from IndexedDB. */ }
  }
  finally { db.close() }
}
