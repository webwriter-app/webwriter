// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {
  isStoredLocalPackageDirectory,
  LocalPackageWorkerClient,
  requestLocalPackageDirectoryPermission,
  type StoredLocalPackageDirectory,
} from "./local-package-worker-client"
import type {LocalPackageDirectoryHandle} from "./local-package-worker"

const directoryHandle = (): LocalPackageDirectoryHandle => ({
  kind: "directory",
  getDirectoryHandle: async() => directoryHandle(),
  getFileHandle: async() => ({getFile: async() => new Blob()}),
})

function stubIndexedDb(records: unknown[], fail = false) {
  const put = vi.fn()
  const remove = vi.fn()
  const database = {
    objectStoreNames: {contains: () => true},
    transaction: () => {
      const transaction: {objectStore: () => unknown, oncomplete?: () => void, onerror?: () => void, onabort?: () => void} = {
        objectStore: () => ({
          put,
          delete: remove,
          getAll: () => {
            const request: {result?: unknown[], onsuccess?: () => void, onerror?: () => void} = {result: records}
            queueMicrotask(() => fail ? request.onerror?.() : request.onsuccess?.())
            return request
          },
        }),
      }
      queueMicrotask(() => fail ? transaction.onerror?.() : transaction.oncomplete?.())
      return transaction
    },
    close: vi.fn(),
  }
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request: {
        result: typeof database
        onupgradeneeded?: () => void
        onsuccess?: () => void
        onerror?: () => void
      } = {result: database}
      queueMicrotask(() => {
        request.onupgradeneeded?.()
        fail ? request.onerror?.() : request.onsuccess?.()
      })
      return request
    },
  })
  return {put, remove}
}

function stubServiceWorker(response: (message: any, port: MessagePort) => void = (message, port) => {
  port.postMessage({type: "local-package-worker-ack", requestId: message.requestId, ok: true})
}) {
  const active = {
    postMessage: vi.fn((message: unknown, ports: Transferable[]) => {
      queueMicrotask(() => response(message, ports[0] as MessagePort))
    }),
  }
  const registration = {active} as unknown as ServiceWorkerRegistration
  const register = vi.fn().mockResolvedValue(registration)
  vi.stubGlobal("navigator", {serviceWorker: {register, ready: Promise.resolve({active: {postMessage: vi.fn()}})}})
  return {active, registration, register}
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("LocalPackageWorkerClient stored directory handles", () => {
  it("returns valid persisted handles and filters malformed records", async() => {
    const handle = directoryHandle()
    const records = [
      {id: "valid", handle},
      {id: "", handle},
      {id: "file-handle", handle: {...handle, kind: "file"}},
      {id: "missing-handle"},
      null,
    ]
    stubIndexedDb(records)
    const client = new LocalPackageWorkerClient()

    const stored = await client.storedDirectories()

    expect(stored).toEqual([{id: "valid", handle}])
    expect(isStoredLocalPackageDirectory(stored[0])).toBe(true)
  })

  it("returns an empty list when IndexedDB is unavailable", async() => {
    vi.stubGlobal("indexedDB", undefined)
    const client = new LocalPackageWorkerClient()

    await expect(client.storedDirectories()).resolves.toEqual([])
  })

  it("returns an empty list when IndexedDB fails", async() => {
    stubIndexedDb([], true)
    const client = new LocalPackageWorkerClient()

    await expect(client.storedDirectories()).resolves.toEqual([])
  })

  it("guards arbitrary values before they can be posted to a worker", () => {
    const handle = directoryHandle()
    const valid: StoredLocalPackageDirectory = {id: "valid", handle}

    expect(isStoredLocalPackageDirectory(valid)).toBe(true)
    expect(isStoredLocalPackageDirectory({id: "valid", handle: {...handle, kind: "file"}})).toBe(false)
    expect(isStoredLocalPackageDirectory({id: "valid", handle: {}})).toBe(false)
    expect(isStoredLocalPackageDirectory({id: "", handle})).toBe(false)
    expect(isStoredLocalPackageDirectory(null)).toBe(false)
  })

  it("persists a handle after registering it with the worker", async() => {
    const {put} = stubIndexedDb([])
    stubServiceWorker()
    const handle = directoryHandle()
    const client = new LocalPackageWorkerClient({scriptUrl: "/worker.js", scope: "/app/"})

    await client.register("demo", handle)

    expect(put).toHaveBeenCalledWith({id: "demo", handle})
  })

  it("loads persisted handles and restores them into a restarted worker", async() => {
    const handle = directoryHandle()
    stubIndexedDb([{id: "persisted", handle}])
    const {active} = stubServiceWorker()
    const client = new LocalPackageWorkerClient()

    await client.start()

    expect(active.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "register-local-package",
      id: "persisted",
      handle,
    }), expect.any(Array))
  })

  it("persists a handle before worker registration can fail", async() => {
    const {put} = stubIndexedDb([])
    vi.stubGlobal("navigator", {
      serviceWorker: {register: vi.fn().mockRejectedValue(new Error("Worker registration failed"))},
    })
    const handle = directoryHandle()
    const client = new LocalPackageWorkerClient()

    await expect(client.register("demo", handle)).rejects.toThrow("Worker registration failed")

    expect(put).toHaveBeenCalledWith({id: "demo", handle})
  })

  it("restores permission on a directory handle loaded from IndexedDB", async() => {
    const queryPermission = vi.fn().mockResolvedValue("prompt")
    const requestPermission = vi.fn().mockResolvedValue("granted")
    const handle = {...directoryHandle(), queryPermission, requestPermission}

    await expect(requestLocalPackageDirectoryPermission(handle)).resolves.toBe(true)

    expect(queryPermission).toHaveBeenCalledWith({mode: "readwrite"})
    expect(requestPermission).toHaveBeenCalledWith({mode: "readwrite"})
  })

  it("does not prompt again when persisted directory permission is still granted", async() => {
    const queryPermission = vi.fn().mockResolvedValue("granted")
    const requestPermission = vi.fn()
    const handle = {...directoryHandle(), queryPermission, requestPermission}

    await expect(requestLocalPackageDirectoryPermission(handle)).resolves.toBe(true)

    expect(requestPermission).not.toHaveBeenCalled()
  })
})

describe("LocalPackageWorkerClient failures", () => {
  it("reports browsers without service worker support", async() => {
    vi.stubGlobal("navigator", {})

    await expect(new LocalPackageWorkerClient().start()).rejects.toThrow("does not support service workers")
  })

  it("uses the registration returned for this worker instead of an unrelated ready worker", async() => {
    vi.stubGlobal("indexedDB", undefined)
    const {active, registration, register} = stubServiceWorker()
    const client = new LocalPackageWorkerClient({scriptUrl: "/worker.js", scope: "/app/"})

    await expect(client.start()).resolves.toBe(registration)
    await client.register("demo", directoryHandle())

    expect(register).toHaveBeenCalledWith("/worker.js", {scope: "/app/", type: "module"})
    expect(active.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "register-local-package",
      id: "demo",
    }), expect.any(Array))
  })

  it("reports a registration without an installable worker", async() => {
    vi.stubGlobal("navigator", {
      serviceWorker: {register: vi.fn().mockResolvedValue({})},
    })

    await expect(new LocalPackageWorkerClient().start()).rejects.toThrow("did not install")
  })

  it("rejects malformed worker acknowledgements", async() => {
    vi.stubGlobal("indexedDB", undefined)
    stubServiceWorker((_message, port) => port.postMessage({type: "unexpected", ok: true}))
    const client = new LocalPackageWorkerClient()

    await expect(client.register("demo", directoryHandle())).rejects.toThrow("Invalid local package service worker response")
  })

  it("times out when the worker never responds", async() => {
    vi.useFakeTimers()
    vi.stubGlobal("indexedDB", undefined)
    stubServiceWorker(() => {})
    const client = new LocalPackageWorkerClient({timeoutMs: 25})
    const registering = client.register("demo", directoryHandle())
    const rejection = expect(registering).rejects.toThrow("did not respond")

    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })
})
