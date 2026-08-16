import {
  createLocalPackageRequestHandler,
  localPackageFetchResponse,
  type LocalPackageDirectoryHandle,
} from "./local-package-worker"
import {
  LOCAL_PACKAGE_WORKER_DB,
  LOCAL_PACKAGE_WORKER_STORE,
  type LocalPackageWorkerMessage,
} from "./local-package-worker-protocol"

type StoredDirectory = {
  id: string
  handle: LocalPackageDirectoryHandle
}

type WorkerScope = ServiceWorkerGlobalScope & {
  indexedDB?: IDBFactory
}

const worker = globalThis as unknown as WorkerScope
const roots = new Map<string, LocalPackageDirectoryHandle>()
const requestHandler = createLocalPackageRequestHandler(roots)

function isDirectoryHandle(value: unknown): value is LocalPackageDirectoryHandle {
  if(!value || typeof value !== "object") return false
  const candidate = value as Partial<LocalPackageDirectoryHandle>
  return candidate.kind !== "file"
    && typeof candidate.getDirectoryHandle === "function"
    && typeof candidate.getFileHandle === "function"
}

function openDatabase() {
  if(!worker.indexedDB) return Promise.resolve<IDBDatabase | null>(null)
  return new Promise<IDBDatabase | null>(resolve => {
    try {
      const request = worker.indexedDB!.open(LOCAL_PACKAGE_WORKER_DB, 1)
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

async function writeDirectory(record: StoredDirectory) {
  const database = await openDatabase()
  if(!database) return
  await new Promise<void>(resolve => {
    const transaction = database.transaction(LOCAL_PACKAGE_WORKER_STORE, "readwrite")
    transaction.objectStore(LOCAL_PACKAGE_WORKER_STORE).put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
  database.close()
}

async function deleteDirectory(id: string) {
  const database = await openDatabase()
  if(!database) return
  await new Promise<void>(resolve => {
    const transaction = database.transaction(LOCAL_PACKAGE_WORKER_STORE, "readwrite")
    transaction.objectStore(LOCAL_PACKAGE_WORKER_STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
  database.close()
}

async function clearDirectories() {
  const database = await openDatabase()
  if(!database) return
  await new Promise<void>(resolve => {
    const transaction = database.transaction(LOCAL_PACKAGE_WORKER_STORE, "readwrite")
    transaction.objectStore(LOCAL_PACKAGE_WORKER_STORE).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
  database.close()
}

async function restoreDirectories() {
  const database = await openDatabase()
  if(!database) return
  await new Promise<void>(resolve => {
    const request = database.transaction(LOCAL_PACKAGE_WORKER_STORE, "readonly")
      .objectStore(LOCAL_PACKAGE_WORKER_STORE)
      .getAll()
    request.onsuccess = () => {
      for(const record of request.result as StoredDirectory[]) {
        if(record?.id && isDirectoryHandle(record.handle)) roots.set(record.id, record.handle)
      }
      resolve()
    }
    request.onerror = () => resolve()
  })
  database.close()
}

function acknowledge(event: ExtendableMessageEvent, requestId: string | undefined, ok: boolean, error?: string) {
  if(!requestId || !event.ports[0]) return
  event.ports[0].postMessage({
    type: "local-package-worker-ack",
    requestId,
    ok,
    ...(error ? {error} : {}),
  })
}

async function handleMessage(event: ExtendableMessageEvent) {
  const message = event.data as Partial<LocalPackageWorkerMessage> | undefined
  if(!message || typeof message.type !== "string") return
  try {
    if(message.type === "register-local-package") {
      if(typeof message.id !== "string" || !isDirectoryHandle(message.handle)) {
        throw new TypeError("Invalid local package directory handle")
      }
      roots.set(message.id, message.handle)
      await writeDirectory({id: message.id, handle: message.handle})
      acknowledge(event, message.requestId, true)
      return
    }
    if(message.type === "unregister-local-package") {
      if(typeof message.id !== "string" || !message.id) throw new TypeError("Invalid local package id")
      roots.delete(message.id)
      await deleteDirectory(message.id)
      acknowledge(event, message.requestId, true)
      return
    }
    if(message.type === "clear-local-packages") {
      roots.clear()
      await clearDirectories()
      acknowledge(event, message.requestId, true)
    }
  }
  catch(error) {
    acknowledge(event, message.requestId, false, error instanceof Error ? error.message : String(error))
  }
}

worker.addEventListener("install", event => {
  event.waitUntil(worker.skipWaiting())
})

worker.addEventListener("activate", event => {
  event.waitUntil((async() => {
    await restoreDirectories()
    await worker.clients.claim()
  })())
})

worker.addEventListener("message", event => {
  event.waitUntil(handleMessage(event))
})

worker.addEventListener("fetch", event => {
  const response = localPackageFetchResponse(event.request, requestHandler)
  if(response) event.respondWith(response)
})
