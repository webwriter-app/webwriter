import {
  LOCAL_PACKAGE_WORKER_DB,
  LOCAL_PACKAGE_WORKER_STORE,
} from "./local-package-worker-protocol"
import type {LocalPackageDirectoryHandle} from "./local-package-worker"

export type StoredLocalPackageDirectory = {
  readonly id: string
  readonly handle: LocalPackageDirectoryHandle
}

export function isLocalPackageDirectoryHandle(value: unknown): value is LocalPackageDirectoryHandle {
  if(!value || typeof value !== "object") return false
  const candidate = value as Partial<LocalPackageDirectoryHandle>
  return candidate.kind !== "file"
    && typeof candidate.getDirectoryHandle === "function"
    && typeof candidate.getFileHandle === "function"
}

/** Runtime guard for records read from IndexedDB (which is untrusted input). */
export function isStoredLocalPackageDirectory(value: unknown): value is StoredLocalPackageDirectory {
  if(!value || typeof value !== "object") return false
  const record = value as Partial<StoredLocalPackageDirectory>
  const handle = record.handle
  return typeof record.id === "string"
    && record.id.length > 0
    && isLocalPackageDirectoryHandle(handle)
}

function openDatabase(indexedDatabase: IDBFactory | undefined = globalThis.indexedDB) {
  if(!indexedDatabase) return Promise.resolve<IDBDatabase | null>(null)
  return new Promise<IDBDatabase | null>(resolve => {
    try {
      const request = indexedDatabase.open(LOCAL_PACKAGE_WORKER_DB, 1)
      request.onupgradeneeded = () => {
        if(!request.result.objectStoreNames.contains(LOCAL_PACKAGE_WORKER_STORE)) {
          request.result.createObjectStore(LOCAL_PACKAGE_WORKER_STORE, {keyPath: "id"})
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    }
    catch {
      resolve(null)
    }
  })
}

async function runWrite(indexedDatabase: IDBFactory | undefined, operation: (store: IDBObjectStore) => void) {
  const database = await openDatabase(indexedDatabase)
  if(!database) return
  try {
    await new Promise<void>(resolve => {
      const transaction = database.transaction(LOCAL_PACKAGE_WORKER_STORE, "readwrite")
      operation(transaction.objectStore(LOCAL_PACKAGE_WORKER_STORE))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  }
  finally {
    database.close()
  }
}

export async function saveLocalPackageDirectory(record: StoredLocalPackageDirectory, indexedDatabase?: IDBFactory) {
  await runWrite(indexedDatabase, store => store.put(record))
}

export async function removeLocalPackageDirectory(id: string, indexedDatabase?: IDBFactory) {
  await runWrite(indexedDatabase, store => store.delete(id))
}

export async function clearLocalPackageDirectories(indexedDatabase?: IDBFactory) {
  await runWrite(indexedDatabase, store => store.clear())
}

export async function readLocalPackageDirectories(indexedDatabase?: IDBFactory): Promise<StoredLocalPackageDirectory[]> {
  const database = await openDatabase(indexedDatabase)
  if(!database) return []
  try {
    return await new Promise<StoredLocalPackageDirectory[]>(resolve => {
      const request = database.transaction(LOCAL_PACKAGE_WORKER_STORE, "readonly")
        .objectStore(LOCAL_PACKAGE_WORKER_STORE)
        .getAll()
      request.onsuccess = () => {
        const records = Array.isArray(request.result) ? request.result : []
        resolve(records.filter(isStoredLocalPackageDirectory))
      }
      request.onerror = () => resolve([])
    })
  }
  finally {
    database.close()
  }
}
