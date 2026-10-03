import type {BackendSession} from "./backend-client"

export type RecentFileHandle = {
  readonly name: string
  getFile(): Promise<File>
  createWritable(): Promise<{write(data: Blob): Promise<void>, close(): Promise<void>}>
  queryPermission?(options: {mode: "read"}): Promise<PermissionState>
  isSameEntry?(other: RecentFileHandle): Promise<boolean>
}

export type RecentDocument = {id: string, title: string, openedAt: number} & (
  | {kind: "local", handle: RecentFileHandle}
  | {kind: "backend", documentId: string, apiBaseUrl: string, userId: string}
)

const databaseName = "webwriter-recent-documents"
const storeName = "documents"

function isRecentDocument(value: unknown): value is RecentDocument {
  if(!value || typeof value !== "object") return false
  const record = value as Partial<RecentDocument>
  if(typeof record.id !== "string" || !record.id || typeof record.title !== "string"
    || typeof record.openedAt !== "number" || !Number.isFinite(record.openedAt)) return false
  return record.kind === "local"
    ? Boolean(record.handle && typeof record.handle.name === "string" && typeof record.handle.getFile === "function" && typeof record.handle.createWritable === "function")
    : record.kind === "backend" && typeof record.documentId === "string" && Boolean(record.documentId)
      && typeof record.apiBaseUrl === "string" && typeof record.userId === "string"
}

/** File handles require structured cloning in IndexedDB; document contents are never stored. */
async function database(indexedDatabase: IDBFactory | undefined) {
  if(!indexedDatabase) return null
  return new Promise<IDBDatabase | null>(resolve => {
    try {
      const request = indexedDatabase.open(databaseName, 1)
      request.onupgradeneeded = () => {
        if(!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = request.onblocked = () => resolve(null)
    }
    catch {resolve(null)}
  })
}

export async function readRecentDocuments(indexedDatabase = globalThis.indexedDB): Promise<RecentDocument[]> {
  const db = await database(indexedDatabase)
  if(!db) return []
  try {
    return await new Promise<RecentDocument[]>(resolve => {
      const transaction = db.transaction(storeName, "readonly")
      const request = transaction.objectStore(storeName).get("recent")
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.filter(isRecentDocument).sort((a, b) => b.openedAt - a.openedAt).slice(0, 10) : [])
      request.onerror = transaction.onabort = () => resolve([])
    })
  }
  catch {return []}
  finally {db.close()}
}

export async function saveRecentDocuments(documents: RecentDocument[], indexedDatabase = globalThis.indexedDB) {
  const db = await database(indexedDatabase)
  if(!db) return
  try {
    await new Promise<void>(resolve => {
      const transaction = db.transaction(storeName, "readwrite")
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve()
      const store = transaction.objectStore(storeName)
      store.put(documents.slice(0, 10), "recent")
      // Deep links outlive the ten-entry recent list; retain handles only.
      for(const document of documents) if(document.kind === "local") store.put(document, `local:${document.id}`)
    })
  }
  catch { /* History persistence must not prevent opening a document. */ }
  finally {db.close()}
}

export async function rememberRecentDocument(documents: RecentDocument[], opened: RecentDocument) {
  const matching = await Promise.all(documents.map(async document => {
    if(opened.kind === "backend" && document.kind === "backend") return opened.documentId === document.documentId
      && opened.apiBaseUrl === document.apiBaseUrl && opened.userId === document.userId
    if(opened.kind !== "local" || document.kind !== "local") return false
    if(opened.handle === document.handle) return true
    try {return await opened.handle.isSameEntry?.(document.handle) ?? false}
    catch {return false}
  }))
  const previous = documents.find((_, index) => matching[index])
  const remembered = opened.kind === "local" && previous ? {...opened, id: previous.id} : opened
  return [remembered, ...documents.filter((_, index) => !matching[index])].slice(0, 10)
}

export function matchesRecentDocumentSession(document: RecentDocument, session: BackendSession | null) {
  return document.kind === "backend" && session?.apiBaseUrl === document.apiBaseUrl && session.user.id === document.userId
}

export async function recentDocumentAccessible(document: RecentDocument, session: BackendSession | null, documentIds: Set<string>) {
  if(document.kind === "backend") return matchesRecentDocumentSession(document, session) && documentIds.has(document.documentId)
  try {
    if(document.handle.queryPermission && await document.handle.queryPermission({mode: "read"}) !== "granted") return false
    await document.handle.getFile()
    return true
  }
  catch {return false}
}

export function documentOpenReference(document: RecentDocument) {
  return document.kind === "local" ? `local:${document.id}`
    : `${document.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(document.documentId)}`
}

export function parseDocumentOpenReference(value: string) {
  if(value.startsWith("local:") && value.length > 6) return {kind: "local" as const, id: value.slice(6)}
  try {
    const url = new URL(value)
    const match = url.pathname.match(/^(.*)\/documents\/([^/]+)$/)
    if(!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !match) return null
    const documentId = decodeURIComponent(match[2])
    if(!documentId) return null
    url.pathname = match[1] || "/"
    return {kind: "backend" as const, apiBaseUrl: url.href.replace(/\/$/, ""), documentId}
  }
  catch {return null}
}

export async function readLocalDocumentReference(id: string, indexedDatabase = globalThis.indexedDB) {
  const db = await database(indexedDatabase)
  if(!db) return null
  try {
    return await new Promise<Extract<RecentDocument, {kind: "local"}> | null>(resolve => {
      const transaction = db.transaction(storeName, "readonly")
      const request = transaction.objectStore(storeName).get(`local:${id}`)
      request.onsuccess = () => resolve(isRecentDocument(request.result) && request.result.kind === "local" && request.result.id === id ? request.result : null)
      request.onerror = transaction.onabort = () => resolve(null)
    })
  }
  catch {return null}
  finally {db.close()}
}
