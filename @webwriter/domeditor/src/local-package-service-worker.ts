import {
  createLocalPackageRequestHandler,
  localPackageFetchResponse,
  type LocalPackageDirectoryHandle,
} from "./local-package-worker"
import type {LocalPackageWorkerMessage} from "./local-package-worker-protocol"
import {
  clearLocalPackageDirectories,
  isLocalPackageDirectoryHandle,
  readLocalPackageDirectories,
  removeLocalPackageDirectory,
  saveLocalPackageDirectory,
} from "./local-package-storage"

type WorkerScope = ServiceWorkerGlobalScope & {
  indexedDB?: IDBFactory
}

const worker = globalThis as unknown as WorkerScope
const roots = new Map<string, LocalPackageDirectoryHandle>()
const requestHandler = createLocalPackageRequestHandler(roots)

async function restoreDirectories() {
  for(const record of await readLocalPackageDirectories(worker.indexedDB)) {
    roots.set(record.id, record.handle)
  }
}

// A worker can be restarted without running its activate handler again. Start
// restoring as soon as this module is evaluated and make every operation wait
// for the same read, so fetches and messages cannot observe an empty map.
const directoriesReady = restoreDirectories()
let messageQueue = Promise.resolve()

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
    await directoriesReady
    if(message.type === "register-local-package") {
      if(typeof message.id !== "string" || !isLocalPackageDirectoryHandle(message.handle)) {
        throw new TypeError("Invalid local package directory handle")
      }
      roots.set(message.id, message.handle)
      await saveLocalPackageDirectory({id: message.id, handle: message.handle}, worker.indexedDB)
      acknowledge(event, message.requestId, true)
      return
    }
    if(message.type === "unregister-local-package") {
      if(typeof message.id !== "string" || !message.id) throw new TypeError("Invalid local package id")
      roots.delete(message.id)
      await removeLocalPackageDirectory(message.id, worker.indexedDB)
      acknowledge(event, message.requestId, true)
      return
    }
    if(message.type === "clear-local-packages") {
      roots.clear()
      await clearLocalPackageDirectories(worker.indexedDB)
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
    await directoriesReady
    await worker.clients.claim()
  })())
})

worker.addEventListener("message", event => {
  const operation = messageQueue.then(() => handleMessage(event))
  messageQueue = operation.catch(() => {})
  event.waitUntil(operation)
})

worker.addEventListener("fetch", event => {
  const response = localPackageFetchResponse(
    event.request,
    request => directoriesReady.then(() => requestHandler(request)),
  )
  if(response) event.respondWith(response)
})
