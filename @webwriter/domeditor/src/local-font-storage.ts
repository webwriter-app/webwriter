export type FontFileHandle = {
  readonly name: string
  readonly kind?: string
  getFile(): Promise<File>
  queryPermission?(options: {mode: "read"}): Promise<PermissionState>
  requestPermission?(options: {mode: "read"}): Promise<PermissionState>
}

export type StoredFontFile = {id: string, name: string, handle?: FontFileHandle, file?: File}

const databaseName = "webwriter-fonts"
const storeName = "files"

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File
}

function isFontFileHandle(value: unknown): value is FontFileHandle {
  if(!value || typeof value !== "object") return false
  const handle = value as Partial<FontFileHandle>
  return typeof handle.name === "string"
    && (handle.kind === undefined || typeof handle.kind === "string")
    && typeof handle.getFile === "function"
}

function isStoredFontFile(value: unknown): value is StoredFontFile {
  if(!value || typeof value !== "object") return false
  const record = value as Partial<StoredFontFile>
  return typeof record.id === "string" && record.id.length > 0
    && typeof record.name === "string" && record.name.length > 0
    && (isFontFileHandle(record.handle) || isFile(record.file))
}

async function openDatabase(indexedDatabase: IDBFactory | undefined): Promise<IDBDatabase | null> {
  if(!indexedDatabase) return null
  return new Promise(resolve => {
    let settled = false
    const finish = (database: IDBDatabase | null) => {
      if(settled) {
        database?.close()
        return
      }
      settled = true
      resolve(database)
    }
    try {
      const request = indexedDatabase.open(databaseName, 1)
      request.onupgradeneeded = () => {
        if(!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, {keyPath: "id"})
        }
      }
      request.onsuccess = () => finish(request.result)
      request.onerror = request.onblocked = () => finish(null)
    }
    catch {
      finish(null)
    }
  })
}

/** Reads imported font references; malformed IndexedDB values are ignored. */
export async function readFontFiles(indexedDatabase = globalThis.indexedDB): Promise<StoredFontFile[]> {
  const database = await openDatabase(indexedDatabase)
  if(!database) return []
  try {
    return await new Promise<StoredFontFile[]>(resolve => {
      let settled = false
      const finish = (records: StoredFontFile[]) => {
        if(settled) return
        settled = true
        resolve(records)
      }
      try {
        const transaction = database.transaction(storeName, "readonly")
        const request = transaction.objectStore(storeName).getAll()
        request.onsuccess = () => finish(Array.isArray(request.result) ? request.result.filter(isStoredFontFile) : [])
        request.onerror = transaction.onerror = transaction.onabort = () => finish([])
      }
      catch {
        finish([])
      }
    })
  }
  finally {
    database.close()
  }
}

/** Saves either a structured-cloneable file handle or a File from an input control. */
export async function saveFontFile(record: StoredFontFile, indexedDatabase = globalThis.indexedDB): Promise<void> {
  if(!isStoredFontFile(record)) throw new TypeError("Invalid imported font record")
  const database = await openDatabase(indexedDatabase)
  if(!database) throw new Error("IndexedDB is unavailable for imported font storage")
  try {
    await new Promise<void>((resolve, reject) => {
      try {
        const transaction = database.transaction(storeName, "readwrite")
        transaction.objectStore(storeName).put(record)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error("Imported font storage transaction failed"))
        transaction.onabort = () => reject(transaction.error ?? new Error("Imported font storage transaction was aborted"))
      }
      catch(error) {
        reject(error)
      }
    })
  }
  finally {
    database.close()
  }
}
