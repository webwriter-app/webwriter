// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import type {LocalPackageDirectoryHandle} from "./local-package-worker"

describe("local package service worker startup", () => {
  it("waits for persisted roots before serving a fetch after a worker restart", async () => {
    let releaseRestore!: () => void
    const restoreGate = new Promise<void>(resolve => { releaseRestore = resolve })
    const root: LocalPackageDirectoryHandle = {
      async getDirectoryHandle() { return root },
      async getFileHandle() { return {getFile: async() => new Blob(["restored"]) } },
    }
    const records = [{id: "demo", handle: root}]
    const fakeDatabase = {
      objectStoreNames: {contains: () => true},
      transaction: () => ({objectStore: () => ({
        getAll() {
          const request: {result: typeof records, onsuccess?: () => void, onerror?: () => void} = {result: records}
          restoreGate.then(() => request.onsuccess?.())
          return request
        },
        put: vi.fn(), delete: vi.fn(), clear: vi.fn(),
      })}),
      close: vi.fn(),
    }
    const open = () => {
      const request: {result: typeof fakeDatabase, onupgradeneeded?: () => void, onsuccess?: () => void} = {
        result: fakeDatabase,
      }
      queueMicrotask(() => request.onsuccess?.())
      return request
    }
    const listeners = new Map<string, EventListener>()
    const addEventListener = vi.spyOn(globalThis, "addEventListener").mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(type, listener as EventListener)
    }) as typeof globalThis.addEventListener)
    vi.stubGlobal("indexedDB", {open})
    vi.stubGlobal("skipWaiting", vi.fn())
    vi.stubGlobal("clients", {claim: vi.fn()})

    try {
      await import("./local-package-service-worker")
      const respondWith = vi.fn()
      const request = new Request(new URL("/__webwriter/local-packages/demo/widget.js", location.origin))
      listeners.get("fetch")!({request, respondWith} as unknown as Event)
      await Promise.resolve()
      expect(respondWith).toHaveBeenCalled()
      let settled = false
      void respondWith.mock.calls[0][0].then(() => { settled = true })
      await Promise.resolve()
      expect(settled).toBe(false)

      releaseRestore()
      expect((await respondWith.mock.calls[0][0]).status).toBe(200)
      expect(await (await respondWith.mock.calls[0][0]).text()).toBe("restored")
    }
    finally {
      addEventListener.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it("does not keep an unpersisted root registered after a write transaction aborts", async () => {
    vi.resetModules()
    const listeners = new Map<string, EventListener>()
    const addEventListener = vi.spyOn(globalThis, "addEventListener").mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(type, listener as EventListener)
    }) as typeof globalThis.addEventListener)
    const handle: LocalPackageDirectoryHandle = {
      async getDirectoryHandle() { return handle },
      async getFileHandle() { return {getFile: async() => new Blob(["should not be served"])} },
    }
    const database = {
      objectStoreNames: {contains: () => true},
      transaction: (_store: string, mode?: string) => {
        const transaction: {error: DOMException | null, objectStore: () => Record<string, () => unknown>,
          oncomplete?: () => void, onerror?: () => void, onabort?: () => void} = {
          error: mode === "readwrite" ? new DOMException("storage failed", "QuotaExceededError") : null,
          objectStore: () => ({
            getAll: () => {
              const request: {result: unknown[], onsuccess?: () => void} = {result: []}
              queueMicrotask(() => request.onsuccess?.())
              return request
            },
            put: () => undefined,
            delete: () => undefined,
            clear: () => undefined,
          }),
        }
        queueMicrotask(() => mode === "readwrite" ? transaction.onerror?.() : transaction.oncomplete?.())
        return transaction
      },
      close: vi.fn(),
    }
    vi.stubGlobal("indexedDB", {open() {
      const request: {result: typeof database, onsuccess?: () => void} = {result: database}
      queueMicrotask(() => request.onsuccess?.())
      return request
    }})
    vi.stubGlobal("clients", {get: vi.fn().mockResolvedValue(undefined)})

    try {
      await import("./local-package-service-worker")
      const port = {postMessage: vi.fn()}
      const messageEvent = {
        data: {type: "register-local-package", requestId: "register", id: "demo", handle},
        ports: [port],
        waitUntil: vi.fn(),
      }
      listeners.get("message")!(messageEvent as unknown as Event)
      await messageEvent.waitUntil.mock.calls[0][0]
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ok: false, requestId: "register"}))

      const respondWith = vi.fn()
      listeners.get("fetch")!({request: new Request(new URL("/__webwriter/local-packages/demo/widget.js", location.origin)),
        clientId: "frame", respondWith} as unknown as Event)
      expect(await respondWith.mock.calls[0][0]).toMatchObject({status: 503})
    }
    finally {
      addEventListener.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it("answers a failed jsDelivr package file from a mirror under its jsDelivr URL", async () => {
    vi.resetModules()
    const listeners = new Map<string, EventListener>()
    const addEventListener = vi.spyOn(globalThis, "addEventListener").mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.set(type, listener as EventListener)
    }) as typeof globalThis.addEventListener)
    const store = {getAll() {
      const request: {result: unknown[], onsuccess?: () => void} = {result: []}
      queueMicrotask(() => request.onsuccess?.())
      return request
    }}
    const database = {objectStoreNames: {contains: () => true}, transaction: () => ({objectStore: () => store}), close: vi.fn()}
    vi.stubGlobal("indexedDB", {open() {
      const request: {result: typeof database, onsuccess?: () => void} = {result: database}
      queueMicrotask(() => request.onsuccess?.())
      return request
    }})
    const fetches: string[] = []
    vi.stubGlobal("fetch", vi.fn(async(url: string) => {
      fetches.push(url)
      return url.startsWith("https://cdn.jsdelivr.net/") ? new Response(null, {status: 503})
        : new Response("export default 1", {headers: {"content-type": "text/javascript"}})
    }))
    try {
      await import("./local-package-service-worker")
      const respondWith = vi.fn()
      const url = "https://cdn.jsdelivr.net/npm/lit@3.3.3/index.js"
      listeners.get("fetch")!({request: new Request(url), respondWith} as unknown as Event)
      const response: Response = await respondWith.mock.calls[0][0]
      expect(await response.text()).toBe("export default 1")
      expect(response.url).toBe("")
      expect(fetches).toEqual([url, "https://unpkg.com/lit@3.3.3/index.js"])

      const other = vi.fn()
      listeners.get("fetch")!({request: new Request("https://example.test/app.js"), respondWith: other} as unknown as Event)
      expect(other).not.toHaveBeenCalled()
    }
    finally {
      addEventListener.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
