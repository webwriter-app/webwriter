import {
  createLocalPackageRequestHandler,
  localPackageFetchResponse,
  parseLocalPackageRoute,
  type LocalPackageDirectoryHandle,
} from "./local-package-worker"
import type {LocalPackageWorkerMessage} from "./local-package-worker-protocol"
import {fetchNpmFile, npmMirrorUrls} from "./npm-files"
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

async function proxyFrameRequest(request: Request, clientId: string) {
  const client = clientId && await worker.clients.get(clientId)
  if(!client) return new Response("Local package frame is unavailable", {status: 503})
  const channel = new MessageChannel()
  return await new Promise<Response>(resolve => {
    const timer = setTimeout(() => {
      channel.port1.close()
      resolve(new Response("Local package frame did not respond", {status: 504}))
    }, 10_000)
    channel.port1.onmessage = event => {
      clearTimeout(timer)
      channel.port1.close()
      const data = event.data
      if(typeof data?.status !== "number" || !Array.isArray(data.headers)
        || !(data.body instanceof ArrayBuffer)) {
        resolve(new Response("Invalid local package response", {status: 502}))
        return
      }
      resolve(new Response(request.method === "HEAD" ? null : data.body,
        {status: data.status, headers: data.headers}))
    }
    client.postMessage({type: "frame-local-package-request", url: request.url, method: request.method}, [channel.port2])
  })
}

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
      const previous = roots.get(message.id)
      roots.set(message.id, message.handle)
      try {
        await saveLocalPackageDirectory({id: message.id, handle: message.handle}, worker.indexedDB)
      }
      catch(error) {
        if(previous) roots.set(message.id, previous)
        else roots.delete(message.id)
        throw error
      }
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
    request => directoriesReady.then(() => {
      const parsed = parseLocalPackageRoute(request)
      return parsed?.kind === "route" && !roots.has(parsed.route.id)
        ? proxyFrameRequest(request, event.clientId)
        : requestHandler(request)
    }),
  )
  if(response) event.respondWith(response)
  // Published package files come from jsDelivr, or from a mirror when jsDelivr fails. The answer keeps
  // the jsDelivr URL, so import-map scopes and relative imports of the module are unchanged.
  else if(event.request.method === "GET" && npmMirrorUrls(event.request.url).length) {
    event.respondWith(fetchNpmFile(event.request.url, {mode: "cors", credentials: "omit"}))
  }
})
