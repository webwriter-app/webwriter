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
})
